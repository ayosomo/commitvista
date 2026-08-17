import type { ImgHTMLAttributes } from "react";

export default function TestImage(props: ImgHTMLAttributes<HTMLImageElement>) {
  const { alt = "", ...imageProps } = props;
  // Test-only stand-in for the framework image component.
  // eslint-disable-next-line @next/next/no-img-element
  return <img alt={alt} {...imageProps} />;
}
