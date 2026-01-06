import * as Comlink from 'comlink';

const proxy = Comlink.wrap(new Worker(new URL('./qrworker.js', import.meta.url), { type: 'module' }));

export const decode = async function (context) {
  try {
    let canvas = context.canvas;
    let width = canvas.width;
    let height = canvas.height;
    let imageData = context.getImageData(0, 0, width, height);
    return await proxy.detectUrl(width, height, imageData);
  } catch (err) {
    console.log(err);
  }
};
