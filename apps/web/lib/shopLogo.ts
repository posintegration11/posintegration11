/** Max size for restaurant logo data URLs (PNG/JPG/WebP). */
export const SHOP_LOGO_MAX_BYTES = 380 * 1024;

export function readShopLogoFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Please choose an image (PNG, JPG, WebP)."));
      return;
    }
    if (file.size > SHOP_LOGO_MAX_BYTES) {
      reject(new Error("Image must be about 380 KB or smaller."));
      return;
    }
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Could not read the file."));
    r.readAsDataURL(file);
  });
}
