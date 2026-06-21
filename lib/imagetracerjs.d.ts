declare module "imagetracerjs" {
  const ImageTracer: {
    imagedataToSVG: (imageData: ImageData, options?: Record<string, unknown>) => string;
    imageToSVG: (url: string, callback: (svg: string) => void, options?: Record<string, unknown>) => void;
    [key: string]: any;
  };
  export default ImageTracer;
}
