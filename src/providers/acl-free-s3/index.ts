import { S3FileService } from '@medusajs/file-s3/dist/services/s3-file'
import { ModuleProvider, Modules } from '@medusajs/framework/utils'

/**
 * S3 file provider that omits the ACL header on upload.
 *
 * Why
 * ---
 * `@medusajs/file-s3` attaches an ACL to every PutObject it sends:
 *
 *   s3-file.js:84   ACL: file.access === 'public' ? 'public-read' : 'private',
 *   s3-file.js:118  ACL: fileData.access === 'public' ? 'public-read' : 'private',
 *   s3-file.js:192  ACL: acl,                       // getPresignedUploadUrl
 *
 * Sirv does not implement S3 bucket ACLs, so that header is at best ignored and
 * at worst rejected outright with `AccessControlListNotSupported`, which
 * surfaces to the Medusa admin as a 500 on POST /admin/uploads. The upload
 * workflow creates the file row before the S3 call, so a rejected upload leaves
 * behind an image record with no `url`, which is worse than a clean failure.
 *
 * Dropping the header is functionally harmless here: a Sirv bucket is public by
 * default and the files are served straight off `https://wisled.sirv.com/<key>`,
 * so there is no per-object permission state for the ACL to set.
 *
 * How
 * ---
 * The header is produced while serializing the command, so it is removed from
 * the command input in a `send()` override rather than by a middleware. Doing
 * it this way means the header is never generated at all, and it covers both
 * the direct upload and the presigned-upload paths with one interception point.
 *
 * The base class calls `getClient()` from its own constructor, so overriding it
 * here is enough for `this.client_` to be the wrapped client.
 */
class AclFreeS3FileService extends S3FileService {
  protected getClient() {
    const client = super.getClient()
    const send = client.send.bind(client)

    client.send = (command: any, ...rest: any[]) => {
      if (command?.input && 'ACL' in command.input) {
        delete command.input.ACL
      }
      return send(command, ...rest)
    }

    return client
  }
}

export default ModuleProvider(Modules.FILE, {
  services: [AclFreeS3FileService],
})
