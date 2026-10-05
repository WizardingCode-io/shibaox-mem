// Assets embedded in the binary: text imports give the contents, file imports a path
// that Bun.file() can read, in development and in the compiled executable alike.
declare module "*.css" {
  const text: string;
  export default text;
}
declare module "*.svg" {
  const text: string;
  export default text;
}
declare module "*.woff2" {
  const path: string;
  export default path;
}
