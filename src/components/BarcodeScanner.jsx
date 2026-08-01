import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { Camera, Flashlight, Keyboard, X } from "lucide-react";

const ROI_WIDTH = 0.72;
const ROI_HEIGHT = 0.38;
const SCAN_INTERVAL_MS = 150;
const SAME_CODE_COOLDOWN_MS = 2500;
const SUCCESS_PAUSE_MS = 900;

function stopStream(stream) {
  stream?.getTracks?.().forEach((track) => track.stop());
}

function playSuccessSound() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, context.currentTime);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.11);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.12);
    oscillator.addEventListener("ended", () => context.close().catch(() => {}));
  } catch {
    // Sound is optional and may be blocked by the browser.
  }
}

export default function BarcodeScanner({
  open,
  title = "Scan barcode",
  onClose,
  onDetected,
  continuous = false,
  vibration = true,
  sound = true
}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const boxRef = useRef(null);
  const streamRef = useRef(null);
  const animationRef = useRef(null);
  const lastAttemptRef = useRef(0);
  const pauseUntilRef = useRef(0);
  const lastCodeRef = useRef({ code: "", at: 0 });
  const onDetectedRef = useRef(onDetected);
  const [status, setStatus] = useState("Starting camera...");
  const [manualCode, setManualCode] = useState("");
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    if (!open) return undefined;

    let cancelled = false;
    let decoding = false;
    const reader = new BrowserMultiFormatReader(undefined, {
      delayBetweenScanAttempts: 120,
      delayBetweenScanSuccess: SUCCESS_PAUSE_MS
    });

    setStatus("Starting camera...");
    setManualCode("");
    setTorchAvailable(false);
    setTorchOn(false);
    pauseUntilRef.current = 0;
    lastCodeRef.current = { code: "", at: 0 };

    function feedback() {
      if (vibration) navigator.vibrate?.([70, 35, 70]);
      if (sound) playSuccessSound();
    }

    async function deliver(code) {
      const now = Date.now();
      if (
        lastCodeRef.current.code === code
        && now - lastCodeRef.current.at < SAME_CODE_COOLDOWN_MS
      ) {
        return;
      }

      pauseUntilRef.current = now + SUCCESS_PAUSE_MS;

      try {
        const accepted = await Promise.resolve(onDetectedRef.current?.(code));
        if (accepted === false) {
          throw new Error("The scanned code could not be added.");
        }
        lastCodeRef.current = { code, at: now };
        setStatus(`Added: ${code}. Keep scanning or close when finished.`);
        feedback();
      } catch (error) {
        lastCodeRef.current = { code: "", at: 0 };
        pauseUntilRef.current = Date.now() + 450;
        setStatus(error?.message || "The barcode was read, but the product could not be added.");
        return;
      }

      if (!continuous) {
        if (animationRef.current) cancelAnimationFrame(animationRef.current);
        stopStream(streamRef.current);
      } else {
        window.setTimeout(() => {
          if (!cancelled) setStatus("Place the next barcode inside the white box.");
        }, SUCCESS_PAUSE_MS);
      }
    }

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 }
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
        setStatus(
          continuous
            ? "Place a barcode inside the white box. The camera stays open for the next product."
            : "Place the barcode inside the white box."
        );

        async function scanFrame(timestamp) {
          if (cancelled) return;
          animationRef.current = requestAnimationFrame(scanFrame);

          if (Date.now() < pauseUntilRef.current) return;
          if (decoding) return;
          if (timestamp - lastAttemptRef.current < SCAN_INTERVAL_MS) return;
          lastAttemptRef.current = timestamp;
          if (!video.videoWidth || !video.videoHeight) return;

          const videoRect = video.getBoundingClientRect();
          const boxRect = boxRef.current?.getBoundingClientRect();
          const coverScale = Math.max(
            videoRect.width / video.videoWidth,
            videoRect.height / video.videoHeight
          );
          const renderedWidth = video.videoWidth * coverScale;
          const renderedHeight = video.videoHeight * coverScale;
          const hiddenX = Math.max(0, (renderedWidth - videoRect.width) / 2);
          const hiddenY = Math.max(0, (renderedHeight - videoRect.height) / 2);

          let sourceX;
          let sourceY;
          let sourceWidth;
          let sourceHeight;

          if (boxRect && coverScale > 0) {
            sourceX = Math.round((boxRect.left - videoRect.left + hiddenX) / coverScale);
            sourceY = Math.round((boxRect.top - videoRect.top + hiddenY) / coverScale);
            sourceWidth = Math.round(boxRect.width / coverScale);
            sourceHeight = Math.round(boxRect.height / coverScale);
          } else {
            sourceWidth = Math.round(video.videoWidth * ROI_WIDTH);
            sourceHeight = Math.round(video.videoHeight * ROI_HEIGHT);
            sourceX = Math.round((video.videoWidth - sourceWidth) / 2);
            sourceY = Math.round((video.videoHeight - sourceHeight) / 2);
          }

          sourceX = Math.max(0, Math.min(sourceX, video.videoWidth - 1));
          sourceY = Math.max(0, Math.min(sourceY, video.videoHeight - 1));
          sourceWidth = Math.max(1, Math.min(sourceWidth, video.videoWidth - sourceX));
          sourceHeight = Math.max(1, Math.min(sourceHeight, video.videoHeight - sourceY));

          const canvas = canvasRef.current;
          const maxCanvasWidth = 1100;
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

          decoding = true;
          try {
            const result = await reader.decodeFromCanvas(canvas);
            const text = result?.getText?.()?.trim();
            if (text) await deliver(text);
          } catch {
            // No barcode was found inside the target box in this frame.
          } finally {
            decoding = false;
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
  }, [open, continuous, vibration, sound]);

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

  async function submitManual(event) {
    event.preventDefault();
    const value = manualCode.trim();
    if (!value) return;

    try {
      const accepted = await Promise.resolve(onDetectedRef.current?.(value));
      if (accepted === false) throw new Error("The entered code could not be added.");
      if (vibration) navigator.vibrate?.(90);
      if (sound) playSuccessSound();
      setManualCode("");
      setStatus(continuous ? "Code added. Enter or scan the next product." : `Added: ${value}`);
      if (!continuous) stopStream(streamRef.current);
    } catch (error) {
      setStatus(error?.message || "The entered code could not be added.");
    }
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
            <div className="scanner-box" ref={boxRef}>
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
