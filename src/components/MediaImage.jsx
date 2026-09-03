import { useEffect, useMemo, useRef, useState } from "react";
import {
  PRODUCT_IMAGE_PLACEHOLDER,
  cloudinaryImageUrl,
  normalizeMediaUrl,
  isMediaUrlCached,
  isMediaUrlFailed,
  markMediaUrlLoaded,
  markMediaUrlFailed
} from "../lib/media";

export default function MediaImage({
  src,
  alt = "",
  width,
  height,
  crop = "fill",
  gravity = "auto",
  quality = "auto:eco",
  className = "",
  imgClassName = "",
  placeholder = PRODUCT_IMAGE_PLACEHOLDER,
  eager = false,
  onClick,
  title
}) {
  const normalized = useMemo(() => normalizeMediaUrl(src), [src]);
  const displayUrl = useMemo(
    () => cloudinaryImageUrl(normalized, { width, height, crop, gravity, quality }),
    [normalized, width, height, crop, gravity, quality]
  );

  const isFallbackOrEmpty = !displayUrl || isMediaUrlFailed(displayUrl);

  const [status, setStatus] = useState(() => {
    if (isFallbackOrEmpty) return "fallback";
    if (isMediaUrlCached(displayUrl)) return "ready";
    return "loading";
  });
  const imgRef = useRef(null);

  useEffect(() => {
    if (!displayUrl || isMediaUrlFailed(displayUrl)) {
      setStatus("fallback");
      return;
    }
    if (isMediaUrlCached(displayUrl)) {
      setStatus("ready");
      return;
    }

    if (imgRef.current?.complete && imgRef.current?.naturalWidth > 0) {
      markMediaUrlLoaded(displayUrl);
      setStatus("ready");
      return;
    }

    setStatus("loading");
  }, [displayUrl]);

  const shownUrl = (status === "error" || status === "fallback" || !displayUrl)
    ? placeholder
    : displayUrl;

  const handleLoad = () => {
    // If we are showing the fallback placeholder or there is no displayUrl, do not flip to "ready"
    if (!displayUrl || status === "fallback" || isMediaUrlFailed(displayUrl)) {
      return;
    }
    markMediaUrlLoaded(displayUrl);
    setStatus("ready");
  };

  const handleError = () => {
    if (displayUrl && !isMediaUrlFailed(displayUrl)) {
      markMediaUrlFailed(displayUrl);
    }
    setStatus("fallback");
  };

  return (
    <span
      className={`media-image-frame ${status === "loading" ? "is-loading" : ""} ${status === "error" || status === "fallback" ? "is-fallback" : ""} ${className}`.trim()}
      onClick={onClick}
      title={title}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (event) => {
        if (event.key === "Enter" || event.key === " ") onClick(event);
      } : undefined}
    >
      {status === "loading" && <span className="media-image-loader" aria-hidden="true" />}
      <img
        ref={imgRef}
        src={shownUrl}
        alt={alt}
        className={imgClassName}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        onLoad={handleLoad}
        onError={handleError}
      />
    </span>
  );
}
