import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { Camera, Keyboard, X } from "lucide-react";

export default function BarcodeScanner({ open, title = "Scan barcode", onClose, onDetected }) {
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const readerRef = useRef(null);
  const detectedRef = useRef(false);
  const [status, setStatus] = useState("Starting camera...");
  const [manualCode, setManualCode] = useState("");

  useEffect(() => {
    if (!open) return undefined;

    let cancelled = false;
    detectedRef.current = false;
    setStatus("Starting camera...");

    async function start() {
      try {
        const reader = new BrowserMultiFormatReader(undefined, {
          delayBetweenScanAttempts: 120,
          delayBetweenScanSuccess: 900
        });
        readerRef.current = reader;

        const controls = await reader.decodeFromConstraints(
          {
            audio: false,
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1280 },
              height: { ideal: 720 }
            }
          },
          videoRef.current,
          (result) => {
            if (!result || detectedRef.current) return;
            detectedRef.current = true;
            const text = result.getText();
            setStatus(`Detected: ${text}`);
            window.navigator?.vibrate?.(90);
            controlsRef.current?.stop();
            onDetected(text);
          }
        );

        if (cancelled) {
          controls.stop();
          return;
        }

        controlsRef.current = controls;
        setStatus("Place the barcode inside the white box.");
      } catch (error) {
        if (!cancelled) {
          setStatus(
            error?.name === "NotAllowedError"
              ? "Camera permission was denied. Allow camera access or enter the barcode manually."
              : "Camera could not start. Enter the barcode manually."
          );
        }
      }
    }

    start();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
      readerRef.current = null;
    };
  }, [open, onDetected]);

  if (!open) return null;

  function submitManual(event) {
    event.preventDefault();
    const value = manualCode.trim();
    if (!value) return;
    onDetected(value);
  }

  return (
    <div className="scanner-layer" role="presentation">
      <section className="scanner-card" role="dialog" aria-modal="true" aria-label={title}>
        <header className="scanner-header">
          <div>
            <Camera size={21} />
            <strong>{title}</strong>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close scanner">
            <X size={22} />
          </button>
        </header>

        <div className="scanner-stage">
          <video ref={videoRef} muted playsInline />
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
            autoFocus={false}
          />
          <button type="submit" className="primary-button">Use code</button>
        </form>
      </section>
    </div>
  );
}
