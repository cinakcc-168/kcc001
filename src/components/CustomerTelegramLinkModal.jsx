import { useEffect } from "react";
import { Copy, Send } from "lucide-react";
import Modal from "./Modal";
import { useLanguage } from "../context/LanguageContext";

export default function CustomerTelegramLinkModal({ link, botUsername, onClose }) {
  const { t } = useLanguage();
  useEffect(() => {
    if (!link) return;
  }, [link]);
  if (!link) return null;
  const command = `/join ${link.code}`;
  const deepLink = botUsername ? `https://t.me/${botUsername}?start=customer_${link.code}` : "";
  async function copy(value) {
    await navigator.clipboard.writeText(value);
  }
  return (
    <Modal title={t("Connect customer Telegram")} onClose={onClose}>
      <div className="telegram-customer-link">
        <Send size={42} />
        <h3>{link.customer_name}</h3>
        <p>{t("This one-time code expires in 10 minutes.")}</p>
        <code>{link.code}</code>
        <button type="button" className="secondary-button" onClick={() => copy(command)}><Copy size={18} />{t("Copy /join command")}</button>
        {deepLink && <a className="primary-button" href={deepLink} target="_blank" rel="noreferrer"><Send size={18} />{t("Open Telegram invitation")}</a>}
        <div className="notice info">{t("The customer must choose to connect. Linking enables points checks, offers and marketing messages. Sending /stop immediately disables marketing messages.")}</div>
      </div>
    </Modal>
  );
}
