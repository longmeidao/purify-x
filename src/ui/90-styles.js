  function installStyles() {
    document.getElementById("xps-styles")?.remove();
    const style = document.createElement("style");
    style.id = "xps-styles";
    style.textContent = `
      .${CLASS.hidden} > *:not(.${CLASS.placeholder}) {
        display: none !important;
      }

      /*
       * 右栏的 Premium 订阅入口和“What's happening”热门话题。
       * 两者的 aria-label 会随界面语言变化，所以只用不翻译的锚点定位：
       * Premium 认 /i/premium_sign_up 链接，热门话题认 data-testid="trend"。
       * 选择器命中的是模块最外层包装节点，display:none 会连同它的下外边距
       * 一起消失，不会在侧栏留下空档；作用域限定在 sidebarColumn 内，
       * 探索页主栏的趋势列表不受影响。
       */
      html.${CLASS.sidebarPromoHidden}
        [data-testid="sidebarColumn"] div:has(> div > aside a[href^="/i/premium_sign_up"]),
      html.${CLASS.sidebarPromoHidden}
        [data-testid="sidebarColumn"] div:has(> section [data-testid="trend"]) {
        display: none !important;
      }

      /*
       * 不要把 cellInnerDiv 自身压成 0 高度。X 的虚拟列表会缓存每个 cell
       * 的测量值；直接改写容器几何尺寸会让滚动坐标与渲染窗口失配，表现为
       * 大片空白、上下内容短暂消失或滚到底后像重新载入。
       *
       * 连续组的尾行只压缩我们自己的占位节点，并保留一个很小但可测量的
       * 高度。X 仍能通过 ResizeObserver 正常更新列表，而不会丢失滚动锚点。
       */
      .${CLASS.groupTail}:where(:not(.${CLASS.groupOpen})) > .${CLASS.placeholder} {
        height: ${CONFIG.collapsedTailHeightPx}px;
        min-height: ${CONFIG.collapsedTailHeightPx}px;
        max-height: ${CONFIG.collapsedTailHeightPx}px;
        padding: 0;
        gap: 0;
        overflow: hidden;
        background: transparent;
        border: 0;
      }

      .${CLASS.groupTail}:where(:not(.${CLASS.groupOpen})) > .${CLASS.placeholder} > * {
        display: none !important;
      }

      .${CLASS.groupOpen} > *:not(.${CLASS.placeholder}) {
        display: revert !important;
      }

      .${CLASS.groupOpen}.${CLASS.groupTail} > .${CLASS.placeholder} {
        display: none !important;
      }

      .${CLASS.groupHead}:not(.${CLASS.groupOpen}) .xps-restore {
        display: none !important;
      }

      body.${CLASS.revealAll} .${CLASS.hidden} > *:not(.${CLASS.placeholder}) {
        display: revert !important;
      }

      body.${CLASS.revealAll} .${CLASS.hidden} > .${CLASS.placeholder} {
        display: none !important;
      }

      /* X 的横向多图轮播偶尔漏掉原生 width: 100% class，外层会缩成
         只剩 2px 边框。JS 只给已确认塌缩的多图节点加此 class。 */
      .${CLASS.mediaWidthFix} {
        width: 100% !important;
      }

      /* 图片查看器和分栏视图会把回复区压得很窄。允许换行，让按钮整体
         落到第二行，而不是把左侧文案挤成逐字竖排。 */
      .${CLASS.placeholder} {
        box-sizing: border-box;
        width: 100%;
        min-height: 58px;
        padding: 12px 16px;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 8px 12px;
        color: rgb(113, 118, 123);
        background: rgba(29, 155, 240, 0.045);
        border-bottom: 1px solid rgb(47, 51, 54);
        font: 13px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      /* flex-basis 同时是换行阈值：左侧文案挤到 200px 以下时，
         整块按钮换到第二行，而不是继续压缩文案。 */
      .xps-placeholder-copy {
        min-width: 0;
        display: flex;
        flex: 1 1 200px;
        flex-direction: column;
        gap: 3px;
      }

      .xps-placeholder-label {
        overflow: hidden;
        font-weight: 650;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .xps-placeholder-reason {
        overflow: hidden;
        color: rgb(113, 118, 123);
        font-size: 12px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .${CLASS.accountBadge} {
        box-sizing: border-box;
        height: 18px;
        margin-left: 5px;
        padding: 0 6px;
        display: inline-flex;
        flex: 0 0 auto;
        align-items: center;
        align-self: center;
        vertical-align: middle;
        color: rgb(244, 33, 46);
        background: rgba(244, 33, 46, 0.1);
        border: 1px solid rgba(244, 33, 46, 0.42);
        border-radius: 9999px;
        font: 650 11px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        letter-spacing: 0.01em;
        white-space: nowrap;
      }

      .xps-account-badge-host {
        width: auto !important;
        min-width: 0;
        max-width: 100%;
        display: inline-flex !important;
        flex-direction: row !important;
        flex-wrap: nowrap !important;
        align-items: center !important;
        justify-content: flex-start !important;
        white-space: nowrap !important;
      }

      /* 图片查看器把推文放进窄侧栏，但浏览器视口本身仍然很宽，普通
         viewport media query 无法命中。弹层里优先保留 X 原生身份信息：
         显示名至少露出一段，并隐藏可在普通推文页完成的二级放行操作。 */
      [aria-modal="true"] .xps-account-name-link,
      [role="dialog"] .xps-account-name-link {
        min-width: 64px !important;
        overflow: hidden;
      }

      [aria-modal="true"] .${CLASS.accountBadge},
      [role="dialog"] .${CLASS.accountBadge} {
        width: 20px;
        margin-left: 4px;
        padding: 0;
        flex: 0 0 20px;
        justify-content: center;
        overflow: hidden;
        font-size: 0;
      }

      [aria-modal="true"] .${CLASS.accountBadge}::after,
      [role="dialog"] .${CLASS.accountBadge}::after {
        content: attr(data-xps-compact-label);
        font: 650 11px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      [aria-modal="true"] .xps-account-allow,
      [role="dialog"] .xps-account-allow {
        display: none !important;
      }

      .${CLASS.accountBadge}[data-xps-kind="reply"] {
        color: rgb(255, 122, 0);
        background: rgba(255, 122, 0, 0.1);
        border-color: rgba(255, 122, 0, 0.42);
      }

      .xps-account-allow {
        appearance: none;
        height: 18px;
        margin-left: 4px;
        padding: 0 6px;
        flex: 0 0 auto;
        color: rgb(29, 155, 240);
        background: rgba(29, 155, 240, 0.08);
        border: 1px solid rgba(29, 155, 240, 0.42);
        border-radius: 9999px;
        cursor: pointer;
        font: 650 11px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        white-space: nowrap;
      }

      .xps-account-allow:hover {
        background: rgba(29, 155, 240, 0.16);
      }

      .xps-account-allow:disabled {
        cursor: wait;
        opacity: 0.65;
      }

      .${CLASS.placeholder} button {
        appearance: none;
        flex: 0 0 auto;
        padding: 5px 10px;
        color: rgb(29, 155, 240);
        background: transparent;
        border: 1px solid rgb(83, 100, 113);
        border-radius: 9999px;
        cursor: pointer;
        font: inherit;
        font-weight: 600;
        white-space: nowrap;
      }

      .${CLASS.placeholder} button:hover {
        background: rgba(29, 155, 240, 0.1);
      }

      .${CLASS.placeholder} .xps-allow-account {
        padding-inline: 8px;
        color: rgb(113, 118, 123);
        border-color: transparent;
      }

      .${CLASS.placeholder} .xps-allow-account:hover {
        color: rgb(83, 100, 113);
        background: rgba(83, 100, 113, 0.1);
        border-color: rgba(83, 100, 113, 0.45);
      }

      .${CLASS.placeholder} .xps-block-account {
        color: rgb(244, 33, 46);
        border-color: rgba(244, 33, 46, 0.45);
      }

      .${CLASS.placeholder} .xps-block-account:hover {
        color: rgb(220, 30, 41);
        background: rgba(244, 33, 46, 0.1);
        border-color: rgba(244, 33, 46, 0.7);
      }

      .xps-allow-account:disabled,
      .xps-block-account:disabled {
        cursor: wait;
        opacity: 0.65;
      }

      .xps-appeal-account {
        flex: 0 0 auto;
        padding: 5px 10px;
        color: rgb(29, 155, 240);
        border: 1px solid rgb(83, 100, 113);
        border-radius: 9999px;
        text-decoration: none;
        font: inherit;
        font-weight: 600;
        white-space: nowrap;
      }

      .xps-appeal-account:hover {
        background: rgba(29, 155, 240, 0.1);
        text-decoration: none;
      }

      /* 宽屏时靠右贴边；窄屏时整块换到第二行，再窄则按钮自己继续换行。
         按钮本身始终 flex: 0 0 auto 且 nowrap，收缩只发生在这一层。 */
      .xps-placeholder-actions {
        min-width: 0;
        display: inline-flex;
        flex: 1 1 auto;
        flex-wrap: wrap;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
      }

      #xps-counter {
        position: fixed;
        z-index: 2147483646;
        top: max(16px, env(safe-area-inset-top));
        right: max(16px, env(safe-area-inset-right));
        bottom: auto;
        width: 48px;
        height: 48px;
        padding: 0;
        display: grid;
        place-items: center;
        color: rgb(239, 243, 244);
        background: rgb(0, 0, 0);
        border: 1px solid rgb(47, 51, 54);
        border-radius: 9999px;
        box-shadow: rgba(255, 255, 255, 0.2) 0 0 8px,
          rgba(0, 0, 0, 0.35) 0 4px 16px;
        cursor: pointer;
        font: 700 11px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        -webkit-font-smoothing: antialiased;
        transition: background-color 0.14s ease, transform 0.14s ease;
      }

      #xps-counter[data-theme="light"] {
        color: rgb(15, 20, 25);
        background: rgb(255, 255, 255);
        border-color: rgb(207, 217, 222);
        box-shadow: rgba(0, 0, 0, 0.12) 0 2px 12px;
      }

      .xps-counter-icon {
        width: 24px;
        height: 24px;
        fill: currentColor;
      }

      .xps-counter-count {
        position: absolute;
        top: -4px;
        right: -4px;
        min-width: 18px;
        height: 18px;
        box-sizing: border-box;
        padding: 0 4px;
        display: grid;
        place-items: center;
        color: rgb(255, 255, 255);
        background: rgb(83, 100, 113);
        border: 2px solid rgb(0, 0, 0);
        border-radius: 9999px;
      }

      #xps-counter[data-active="true"] {
        color: rgb(29, 155, 240);
      }

      #xps-counter[data-active="true"] .xps-counter-count {
        background: rgb(29, 155, 240);
      }

      #xps-counter[data-theme="light"] .xps-counter-count {
        border-color: rgb(255, 255, 255);
      }

      #xps-counter:hover,
      #xps-counter:focus-visible {
        background: rgb(22, 24, 28);
        transform: translateY(-1px);
        outline: 2px solid rgb(29, 155, 240);
        outline-offset: 2px;
      }

      #xps-counter[data-theme="light"]:hover,
      #xps-counter[data-theme="light"]:focus-visible {
        background: rgb(239, 243, 244);
      }

      #xps-settings-backdrop {
        position: fixed;
        z-index: 2147483647;
        inset: 0;
        box-sizing: border-box;
        padding: 24px;
        display: grid;
        place-items: center;
        color: rgb(231, 233, 234);
        background: rgba(0, 0, 0, 0.62);
        font: 14px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      #xps-settings-panel {
        box-sizing: border-box;
        width: min(820px, 100%);
        max-height: min(840px, calc(100vh - 48px));
        overflow: hidden;
        display: flex;
        flex-direction: column;
        color: rgb(231, 233, 234);
        background: rgb(0, 0, 0);
        border: 1px solid rgb(47, 51, 54);
        border-radius: 16px;
        box-shadow: 0 12px 36px rgba(0, 0, 0, 0.42);
      }

      #xps-settings-panel header,
      #xps-settings-panel footer {
        padding: 18px 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      #xps-settings-panel header {
        position: sticky;
        z-index: 1;
        top: 0;
        background: rgb(0, 0, 0);
        border-bottom: 1px solid rgb(47, 51, 54);
      }

      #xps-settings-panel h2,
      #xps-settings-panel h3,
      #xps-settings-panel p {
        margin: 0;
      }

      #xps-settings-panel h2 {
        font-size: 20px;
      }

      #xps-settings-panel h3 {
        font-size: 16px;
      }

      #xps-settings-panel p,
      #xps-settings-panel small {
        color: rgb(113, 118, 123);
      }

      #xps-settings-panel button {
        box-sizing: border-box;
        padding: 8px 14px;
        color: inherit;
        background: transparent;
        border: 1px solid rgb(83, 100, 113);
        border-radius: 9999px;
        cursor: pointer;
        font: inherit;
        font-weight: 650;
      }

      #xps-settings-panel button:disabled {
        cursor: wait;
        opacity: 0.6;
      }

      #xps-settings-panel button:focus-visible,
      #xps-settings-panel input:focus-visible,
      #xps-settings-panel textarea:focus-visible,
      .xps-source-card:has(input:focus-visible) {
        outline: 2px solid rgb(29, 155, 240);
        outline-offset: 2px;
      }

      #xps-settings-panel header button {
        width: 36px;
        height: 36px;
        padding: 0;
        border: 0;
        font-size: 26px;
      }

      #xps-settings-panel .xps-settings-primary {
        color: white;
        background: rgb(29, 155, 240);
        border-color: rgb(29, 155, 240);
      }

      .xps-settings-body {
        min-height: 0;
        overflow: auto;
        padding: 4px 20px 18px;
      }

      .xps-settings-section {
        padding: 18px 0;
        border-bottom: 1px solid rgb(47, 51, 54);
      }

      .xps-settings-section:last-child {
        border-bottom: 0;
      }

      .xps-settings-section-heading {
        margin-bottom: 12px;
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
      }

      .xps-settings-section-heading p {
        margin-top: 3px !important;
        font-size: 12px;
      }

      .xps-source-list {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }

      .xps-source-card {
        min-width: 0;
        padding: 12px;
        display: flex;
        align-items: flex-start;
        gap: 10px;
        background: rgb(22, 24, 28);
        border: 1px solid rgb(47, 51, 54);
        border-radius: 12px;
        cursor: pointer;
      }

      .xps-source-card:has(input:checked) {
        background: rgba(29, 155, 240, 0.08);
        border-color: rgba(29, 155, 240, 0.55);
      }

      .xps-source-card input {
        position: absolute;
        opacity: 0;
        pointer-events: none;
      }

      .xps-source-check {
        width: 20px;
        height: 20px;
        flex: 0 0 auto;
        display: grid;
        place-items: center;
        color: transparent;
        border: 1.5px solid rgb(83, 100, 113);
        border-radius: 6px;
        font-size: 13px;
        font-weight: 800;
      }

      .xps-source-card input:checked + .xps-source-check {
        color: white;
        background: rgb(29, 155, 240);
        border-color: rgb(29, 155, 240);
      }

      .xps-source-copy {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .xps-source-title {
        display: flex;
        align-items: center;
        gap: 7px;
        font-weight: 700;
      }

      .xps-source-title a {
        color: rgb(29, 155, 240);
        text-decoration: none;
      }

      .xps-source-title a:hover {
        text-decoration: underline;
      }

      .xps-settings-wide-textarea,
      .xps-settings-grid {
        box-sizing: border-box;
      }

      .xps-settings-wide-textarea {
        width: 100%;
        min-height: 92px;
        resize: vertical;
        padding: 10px 12px;
        color: inherit;
        background: rgb(22, 24, 28);
        border: 1px solid rgb(47, 51, 54);
        border-radius: 10px;
        outline: none;
        font: 13px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;
      }

      .xps-settings-wide-textarea:focus {
        border-color: rgb(29, 155, 240);
      }

      .xps-settings-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 18px;
      }

      .xps-settings-grid label {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 5px;
        font-weight: 650;
      }

      .xps-settings-grid small {
        min-height: 36px;
        font-weight: 400;
      }

      .xps-settings-grid textarea {
        box-sizing: border-box;
        width: 100%;
        min-height: 150px;
        resize: vertical;
        padding: 10px 12px;
        color: inherit;
        background: rgb(22, 24, 28);
        border: 1px solid rgb(47, 51, 54);
        border-radius: 10px;
        outline: none;
        font: 13px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;
      }

      .xps-settings-grid input[type="text"],
      .xps-settings-grid input[type="password"],
      .xps-settings-grid input[type="url"],
      .xps-settings-grid input[type="number"] {
        box-sizing: border-box;
        width: 100%;
        min-height: 42px;
        padding: 9px 11px;
        color: inherit;
        background: rgb(22, 24, 28);
        border: 1px solid rgb(47, 51, 54);
        border-radius: 10px;
        outline: none;
        font: 13px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
      }

      .xps-settings-grid input:focus {
        border-color: rgb(29, 155, 240);
      }

      .xps-ai-options,
      .xps-ai-actions {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 10px 18px;
        margin-bottom: 14px;
      }

      .xps-ai-actions {
        margin: 14px 0 0;
      }

      .xps-inline-check {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-weight: 650;
      }

      .xps-inline-check input {
        width: 18px;
        height: 18px;
        accent-color: rgb(29, 155, 240);
      }

      .xps-ai-grid textarea {
        min-height: 110px;
      }

      .xps-settings-grid-wide {
        grid-column: 1 / -1;
      }

      .xps-settings-grid textarea:focus {
        border-color: rgb(29, 155, 240);
      }

      #xps-settings-status {
        margin: 10px 0 0;
        padding: 12px;
        overflow: auto;
        color: rgb(113, 118, 123);
        background: rgb(22, 24, 28);
        border-radius: 10px;
        font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
        white-space: pre-wrap;
      }

      #xps-settings-feedback {
        margin: 0 20px;
        padding: 10px 12px;
        display: flex;
        align-items: center;
        gap: 9px;
        color: rgb(113, 118, 123);
        background: rgb(22, 24, 28);
        border: 1px solid rgb(47, 51, 54);
        border-radius: 10px;
        transition: color 0.18s ease, background 0.18s ease, border-color 0.18s ease;
      }

      #xps-settings-feedback[data-state="success"] {
        color: rgb(0, 186, 124);
        background: rgba(0, 186, 124, 0.09);
        border-color: rgba(0, 186, 124, 0.45);
      }

      #xps-settings-feedback[data-state="loading"] {
        color: rgb(29, 155, 240);
        border-color: rgba(29, 155, 240, 0.45);
      }

      #xps-settings-feedback[data-state="error"] {
        color: rgb(244, 33, 46);
        background: rgba(244, 33, 46, 0.08);
        border-color: rgba(244, 33, 46, 0.45);
      }

      .xps-feedback-icon {
        width: 22px;
        height: 22px;
        flex: 0 0 auto;
        display: grid;
        place-items: center;
        color: white;
        background: rgb(83, 100, 113);
        border-radius: 9999px;
        font-weight: 900;
      }

      .xps-feedback-spinner {
        width: 16px;
        height: 16px;
        display: block;
        fill: none;
        stroke: currentColor;
        stroke-width: 2.25;
        stroke-linecap: round;
        stroke-dasharray: 72 28;
        transform-origin: 50% 50%;
      }

      #xps-settings-feedback[data-state="success"] .xps-feedback-icon,
      #xps-toast[data-state="success"] .xps-feedback-icon {
        color: white;
        background: rgb(0, 186, 124);
      }

      #xps-settings-feedback[data-state="loading"] .xps-feedback-icon {
        color: white;
        background: rgb(29, 155, 240);
      }

      #xps-settings-feedback[data-state="error"] .xps-feedback-icon,
      #xps-toast[data-state="error"] .xps-feedback-icon {
        color: white;
        background: rgb(244, 33, 46);
      }

      #xps-settings-feedback[data-state="loading"] .xps-feedback-icon {
        background: transparent;
      }

      #xps-settings-feedback[data-state="loading"] .xps-feedback-spinner,
      #xps-toast[data-state="loading"] .xps-feedback-spinner {
        animation: xps-spin 0.8s linear infinite;
      }

      #xps-settings-panel footer {
        justify-content: flex-end;
        flex-wrap: wrap;
      }

      .xps-settings-footer-spacer {
        flex: 1 1 auto;
      }

      #xps-toast {
        position: fixed;
        z-index: 2147483647;
        top: max(20px, env(safe-area-inset-top));
        left: 50%;
        max-width: min(440px, calc(100vw - 32px));
        padding: 11px 15px;
        display: flex;
        align-items: center;
        gap: 9px;
        color: rgb(231, 233, 234);
        background: rgb(22, 24, 28);
        border: 1px solid rgb(47, 51, 54);
        border-radius: 10px;
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.32);
        font: 650 13px/1.3 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        transform: translate(-50%, 0);
        animation: xps-toast-in 0.2s cubic-bezier(.2,.8,.2,1);
      }

      #xps-toast[data-state="success"] {
        border-color: rgba(0, 186, 124, 0.5);
      }

      #xps-toast[data-state="error"] {
        border-color: rgba(244, 33, 46, 0.5);
      }

      #xps-toast.xps-toast-out {
        opacity: 0;
        transform: translate(-50%, -8px);
        transition: opacity 0.22s ease, transform 0.22s ease;
      }

      @keyframes xps-spin {
        to { transform: rotate(360deg); }
      }

      @keyframes xps-toast-in {
        from { opacity: 0; transform: translate(-50%, -12px) scale(0.96); }
        to { opacity: 1; transform: translate(-50%, 0) scale(1); }
      }

      @media (max-width: 700px) {
        #xps-counter {
          top: calc(max(8px, env(safe-area-inset-top)) + 52px);
          right: max(10px, env(safe-area-inset-right));
          bottom: auto;
          width: 44px;
          height: 44px;
        }

        #xps-settings-backdrop {
          padding: 0;
          align-items: end;
        }

        #xps-settings-panel {
          max-height: 92vh;
          border-radius: 16px 16px 0 0;
        }

        .xps-source-list,
        .xps-settings-grid {
          grid-template-columns: 1fr;
        }

        .xps-settings-grid-wide {
          grid-column: auto;
        }

        .xps-settings-footer-spacer {
          display: none;
        }

        #xps-settings-panel footer button {
          white-space: nowrap;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        #xps-counter,
        #xps-settings-feedback,
        #xps-toast,
        #xps-toast.xps-toast-out {
          animation-duration: 0.01ms !important;
          transition-duration: 0.01ms !important;
        }

        .xps-feedback-spinner {
          animation: none !important;
          stroke-dasharray: 50 50;
        }
      }
    `;
    document.documentElement.append(style);
  }
