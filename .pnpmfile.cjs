// .pnpmfile.cjs
module.exports = {
    hooks: {
        readPackage(pkg) {
            return pkg;
        }
    }
}