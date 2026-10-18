import { useRegisterSW } from 'virtual:pwa-register/react';

/** Offers to reload when a new version of the app has been downloaded. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;
  return (
    <div className="toast" role="status">
      <span>Доступна новая версия приложения.</span>
      <button className="small" onClick={() => updateServiceWorker(true)}>
        Обновить
      </button>
      <button className="small secondary" onClick={() => setNeedRefresh(false)}>
        Позже
      </button>
    </div>
  );
}
