import { S3FileService } from '@medusajs/file-s3/dist/services/s3-file'
import { ModuleProvider, Modules } from '@medusajs/framework/utils'

/**
 * S3 file provider that omits the ACL header on upload.
 *
 * Why
 * ---
 * `@medusajs/file-s3` attaches an ACL to every upload it sends:
 *
 *   dist/services/s3-file.js:84   ACL: file.access === 'public' ? 'public-read' : 'private',
 *   dist/services/s3-file.js:118  ACL: fileData.access === 'public' ? 'public-read' : 'private',
 *   dist/services/s3-file.js:192  ACL: acl,                        // getPresignedUploadUrl
 *
 * Supabase Storage does not support per-object ACLs. Its S3 compatibility
 * table lists `x-amz-acl` under unsupported features, so a bucket without
 * object-ACL support answers the header with AccessControlListNotSupported.
 * Medusa wraps that into an opaque failure, which reaches the admin as:
 *
 *   POST /admin/uploads -> 500 {"code":"unknown_error"}
 *
 * The upload workflow creates the product_image row *before* it calls storage,
 * so every rejected attempt also leaves an image record with no `url`, and
 * Medusa then refuses to save the product at all:
 *
 *   Invalid request: Field 'images, 1, url' is required
 *
 * So a rejected header does not merely fail the upload, it poisons the product.
 *
 * Dropping the header is functionally harmless here: Supabase ACLs are
 * bucket-level, the bucket is public, and objects are served straight off
 * `file_url`, so there is no per-object permission state for the header to set.
 *
 * How
 * ---
 * The header is produced while the command is serialized, so it is removed from
 * the command input in a `send()` override rather than by a middleware. Doing it
 * this way means the header is never generated at all, and one interception
 * point covers the direct upload, the streaming upload and the presigned-upload
 * paths.
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