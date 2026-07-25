import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { Camera, Flashlight, Keyboard, X } from "lucide-react";

const ROI_WIDTH = 0.72;
const ROI_HEIGHT = 0.38;

function stopStream(stream) {
  stream?.getTracks?.().forEach((track) => track.stop());
}

export default function BarcodeScanner({
  open,
  title = "Scan barcode",
  onClose,
  onDetected
}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const animationRef = useRef(null);
  const lastAttemptRef = useRef(0);
  const detectedRef = useRef(false);
  const [status, setStatus] = useState("Starting camera...");
  const [manualCode, setManualCode] = useState("");
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  useEffect(() => {
    if (!open) return undefined;

    let cancelled = false;
    const reader = new BrowserMultiFormatReader(undefined, {
      delayBetweenScanAttempts: 120,
      delayBetweenScanSuccess: 900
    });

    detectedRef.current = false;
    setStatus("Starting camera...");
    setManualCode("");
    setTorchAvailable(false);
    setTorchOn(false);

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        });

        if (cancelled) {
          stopStream(stream);
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        video.srcObject = stream;
        await video.play();

        const track = stream.getVideoTracks()[0];
        const capabilities = track?.getCapabilities?.() || {};
        setTorchAvailable(Boolean(capabilities.torch));
        setStatus("Place the barcode inside the white box.");

        async function scanFrame(timestamp) {
          if (cancelled || detectedRef.current) return;
          animationRef.current = requestAnimationFrame(scanFrame);

          if (timestamp - lastAttemptRef.current < 150) return;
          lastAttemptRef.current = timestamp;

          if (!video.videoWidth || !video.videoHeight) return;

          const sourceWidth = Math.round(video.videoWidth * ROI_WIDTH);
          const sourceHeight = Math.round(video.videoHeight * ROI_HEIGHT);
          const sourceX = Math.round((video.videoWidth - sourceWidth) / 2);
          const sourceY = Math.round((video.videoHeight - sourceHeight) / 2);
          const canvas = canvasRef.current;
          const maxCanvasWidth = 960;
          const scale = Math.min(1, maxCanvasWidth / sourceWidth);
          canvas.width = Math.max(1, Math.round(sourceWidth * scale));
          canvas.height = Math.max(1, Math.round(sourceHeight * scale));

          const context = canvas.getContext("2d", { willReadFrequently: true });
          context.drawImage(
            video,
            sourceX,
            sourceY,
            sourceWidth,
            sourceHeight,
            0,
            0,
            canvas.width,
            canvas.height
          );

          try {
            const result = await reader.decodeFromCanvas(canvas);
            const text = result?.getText?.()?.trim();
            if (!text || detectedRef.current) return;

            detectedRef.current = true;
            setStatus(`Detected: ${text}`);
            navigator.vibrate?.(90);
            cancelAnimationFrame(animationRef.current);
            stopStream(streamRef.current);
            onDetected(text);
          } catch {
            // No barcode was found inside the scan box in this frame.
          }
        }

        animationRef.current = requestAnimationFrame(scanFrame);
      } catch (error) {
        if (!cancelled) {
          setStatus(
            error?.name === "NotAllowedError"
              ? "Camera permission was denied. Allow access or enter the code manually."
              : "Camera could not start. Enter the barcode manually."
          );
        }
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, [open, onDetected]);

  if (!open) return null;

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks?.()[0];
    if (!track || !torchAvailable) return;

    try {
      const next = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: next }] });
      setTorchOn(next);
    } catch {
      setStatus("Torch control is not available on this camera.");
    }
  }

  function submitManual(event) {
    event.preventDefault();
    const value = manualCode.trim();
    if (!value) return;
    stopStream(streamRef.current);
    onDetected(value);
  }

  return (
    <div className="scanner-layer" role="presentation">
      <section
        className="scanner-card"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="scanner-header">
          <div>
            <Camera size={21} />
            <strong>{title}</strong>
          </div>
          <div className="scanner-header-actions">
            {torchAvailable && (
              <button
                type="button"
                className={`icon-button ${torchOn ? "active" : ""}`}
                onClick={toggleTorch}
                aria-label="Toggle torch"
              >
                <Flashlight size={21} />
              </button>
            )}
            <button
              type="button"
              className="icon-button"
              onClick={onClose}
              aria-label="Close scanner"
            >
              <X size={22} />
            </button>
          </div>
        </header>

        <div className="scanner-stage">
          <video ref={videoRef} muted playsInline />
          <canvas ref={canvasRef} hidden />
          <div className="scanner-mask" aria-hidden="true">
            <div className="scanner-box">
              <span />
            </div>
          </div>
        </div>

        <p className="scanner-status">{status}</p>

        <form className="scanner-manual" onSubmit={submitManual}>
          <Keyboard size={19} />
          <input
            value={manualCode}
            onChange={(event) => setManualCode(event.target.value)}
            placeholder="Enter barcode or product code"
          />
          <button type="submit" className="primary-button">
            Use code
          </button>
        </form>
      </section>
    </div>
  );
}
