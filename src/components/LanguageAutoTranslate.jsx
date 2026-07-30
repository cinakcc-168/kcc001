import { useEffect } from "react";
import { useLanguage } from "../context/LanguageContext";
import { translateUiText } from "../i18n/translations";

const textState = new WeakMap();
const attributeState = new WeakMap();

const TRANSLATABLE_SELECTOR = [
  "button",
  "option",
  "th",
  "label",
  "legend",
  "summary",
  "h1",
  "h2",
  "h3",
  "h4",
  ".side-label",
  ".eyebrow",
  ".muted",
  ".notice",
  ".empty-state",
  ".status-pill",
  ".quote-status",
  ".page-heading",
  ".panel-heading",
  ".panel-title-row",
  ".modal-heading",
  ".login",
  ".settings-tabs",
  ".metric-card",
  ".dashboard-metric-card",
  ".dashboard-alert-card",
  ".dashboard-register-banner",
  ".permission-route-denied",
  "[data-i18n-auto]"
].join(",");

const SKIP_SELECTOR = [
  "script",
  "style",
  "code",
  "pre",
  "textarea",
  "[contenteditable='true']",
  "[data-i18n-skip]",
  ".no-translate"
].join(",");

const ATTRIBUTES = [
  "placeholder",
  "title",
  "aria-label"
];

function shouldTranslateText(node) {
  const parent = node.parentElement;
  if (!parent) return false;
  if (parent.closest(SKIP_SELECTOR)) return false;
  if (!parent.closest(TRANSLATABLE_SELECTOR)) return false;
  return /[A-Za-z]/.test(node.nodeValue || "");
}

function renderTextNode(node, language) {
  if (!shouldTranslateText(node)) return;

  let state = textState.get(node);

  if (!state) {
    state = {
      source: node.nodeValue,
      rendered: node.nodeValue
    };
    textState.set(node, state);
  } else if (node.nodeValue !== state.rendered) {
    state.source = node.nodeValue;
  }

  const translated = translateUiText(
    state.source,
    language
  );

  state.rendered = translated;

  if (node.nodeValue !== translated) {
    node.nodeValue = translated;
  }
}

function renderAttributes(element, language) {
  if (!(element instanceof HTMLElement)) return;
  if (element.closest(SKIP_SELECTOR)) return;

  let states = attributeState.get(element);
  if (!states) {
    states = new Map();
    attributeState.set(element, states);
  }

  for (const name of ATTRIBUTES) {
    if (!element.hasAttribute(name)) continue;

    const current = element.getAttribute(name) || "";
    let state = states.get(name);

    if (!state) {
      state = {
        source: current,
        rendered: current
      };
      states.set(name, state);
    } else if (current !== state.rendered) {
      state.source = current;
    }

    const translated = translateUiText(
      state.source,
      language
    );

    state.rendered = translated;

    if (current !== translated) {
      element.setAttribute(name, translated);
    }
  }
}

function translateTree(root, language) {
  if (!root) return;

  if (root.nodeType === Node.TEXT_NODE) {
    renderTextNode(root, language);
    return;
  }

  if (!(root instanceof Element)) return;

  renderAttributes(root, language);

  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT
      | NodeFilter.SHOW_TEXT
  );

  let node = walker.nextNode();

  while (node) {
    if (node.nodeType === Node.TEXT_NODE) {
      renderTextNode(node, language);
    } else {
      renderAttributes(node, language);
    }

    node = walker.nextNode();
  }
}

export default function LanguageAutoTranslate() {
  const { language } = useLanguage();

  useEffect(() => {
    translateTree(document.body, language);

    const observer = new MutationObserver(
      (mutations) => {
        for (const mutation of mutations) {
          if (
            mutation.type === "characterData"
          ) {
            renderTextNode(
              mutation.target,
              language
            );
            continue;
          }

          if (
            mutation.type === "attributes"
          ) {
            renderAttributes(
              mutation.target,
              language
            );
            continue;
          }

          for (const node of mutation.addedNodes) {
            translateTree(node, language);
          }
        }
      }
    );

    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ATTRIBUTES
    });

    return () => observer.disconnect();
  }, [language]);

  return null;
}
