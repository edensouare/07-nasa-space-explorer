import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const spaceFacts = [
  'The Sun is so massive that more than 1.3 million Earths could fit inside it.',
  'A day on Venus is longer than a year on Venus because it rotates very slowly.',
  'The Moon is slowly drifting away from Earth by about 3.8 centimeters each year.',
  'Neptune was the first planet discovered through mathematical prediction rather than direct observation.',
  'A single teaspoon of a neutron star would weigh billions of tons on Earth.',
];

const earliestDate = '1995-06-16';
const MAX_DATE_RANGE_DAYS = 14;
const CACHE_TTL_MS = 5 * 60 * 1000;
const nasaRequestCache = new Map();

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

function getDefaultRange() {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - 8);

  return {
    start: formatDate(start),
    end: formatDate(today),
  };
}

function getDayDifference(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const differenceInMs = end.getTime() - start.getTime();
  return Math.round(differenceInMs / (1000 * 60 * 60 * 24));
}

function extractImageUrl(spaceImage) {
  const directImage = spaceImage.hdurl || spaceImage.url;
  if (typeof directImage === 'string' && /\.(jpe?g|png|gif|webp|avif)(\?.*)?$/i.test(directImage)) {
    return directImage;
  }

  const html = typeof spaceImage.basic_html === 'string' ? spaceImage.basic_html : '';
  const match = html.match(/https?:\/\/[^"'\s>]+\.(?:jpe?g|png|gif|webp|avif)(?:\?[^"'\s>]*)?/i);

  if (match) {
    return match[0];
  }

  return typeof spaceImage.url === 'string' ? spaceImage.url : 'img/nasa-worm-logo.png';
}

function getApodUrl(startDate, endDate) {
  return `https://science.nasa.gov/wp-json/wp/v2/apod-basic?start_date=${startDate}&end_date=${endDate}`;
}

function readCache(key) {
  const cachedEntry = nasaRequestCache.get(key);

  if (!cachedEntry) {
    return null;
  }

  if (Date.now() - cachedEntry.timestamp > CACHE_TTL_MS) {
    nasaRequestCache.delete(key);
    return null;
  }

  return cachedEntry.data;
}

function writeCache(key, data) {
  nasaRequestCache.set(key, {
    timestamp: Date.now(),
    data,
  });
}

function useNasaImages(startDate, endDate) {
  const [images, setImages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchImages = useCallback(async (requestedStartDate = startDate, requestedEndDate = endDate) => {
    if (!requestedStartDate || !requestedEndDate) {
      setImages([]);
      setError('Please choose a valid date range.');
      return;
    }

    const dayDifference = getDayDifference(requestedStartDate, requestedEndDate);
    if (dayDifference < 0) {
      setImages([]);
      setError('The start date must be before the end date.');
      return;
    }

    if (dayDifference > MAX_DATE_RANGE_DAYS) {
      setImages([]);
      setError(`The date range cannot exceed ${MAX_DATE_RANGE_DAYS} days.`);
      return;
    }

    const cacheKey = `${requestedStartDate}::${requestedEndDate}`;
    const cachedImages = readCache(cacheKey);

    if (cachedImages) {
      setImages(cachedImages);
      setError('');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      const response = await fetch(getApodUrl(requestedStartDate, requestedEndDate));

      if (!response.ok) {
        throw new Error('Unable to fetch NASA data.');
      }

      const data = await response.json();

      if (!Array.isArray(data) || data.length === 0) {
        setImages([]);
        setError('No space images found for this date range.');
        return;
      }

      const hasPlaceholderData = data.some((spaceImage) => {
        const candidateUrl = extractImageUrl(spaceImage).toLowerCase();
        return spaceImage.title === 'NASA Science' && candidateUrl.includes('nasa-logo');
      });

      if (hasPlaceholderData) {
        setImages([]);
        setError('The NASA API is returning the placeholder logo instead of real APOD images.');
        return;
      }

      const normalizedData = data.map((spaceImage) => ({
        ...spaceImage,
        displayImageUrl: extractImageUrl(spaceImage),
      }));

      writeCache(cacheKey, normalizedData);
      setImages(normalizedData);
      setError('');
    } catch (fetchError) {
      setImages([]);
      setError(fetchError.message || 'Something went wrong while loading the images.');
    } finally {
      setIsLoading(false);
    }
  }, [startDate, endDate]);

  return { images, isLoading, error, fetchImages };
}

function LazyImage({ src, alt, fallbackSrc = 'img/nasa-worm-logo.png', className = '', immediateLoad = false }) {
  const imgRef = useRef(null);
  const [shouldLoad, setShouldLoad] = useState(immediateLoad);

  useEffect(() => {
    if (immediateLoad) {
      setShouldLoad(true);
      return undefined;
    }

    const node = imgRef.current;
    if (!node) {
      return undefined;
    }

    let observer;
    let timeoutId;

    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver((entries) => {
        const [entry] = entries;

        if (entry && entry.isIntersecting) {
          timeoutId = window.setTimeout(() => {
            setShouldLoad(true);
          }, 80);
          observer.disconnect();
        }
      });

      observer.observe(node);
    } else {
      setShouldLoad(true);
    }

    return () => {
      if (observer) {
        observer.disconnect();
      }

      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [immediateLoad]);

  return (
    <img
      ref={imgRef}
      src={shouldLoad ? src : fallbackSrc}
      alt={alt}
      className={className}
      loading={immediateLoad ? 'eager' : 'lazy'}
      decoding="async"
    />
  );
}

function App() {
  const defaultRange = useMemo(() => getDefaultRange(), []);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [notificationPermission, setNotificationPermission] = useState(() =>
    'Notification' in window ? Notification.permission : 'unsupported'
  );
  const [notificationMessage, setNotificationMessage] = useState('');
  const [installPrompt, setInstallPrompt] = useState(null);
  const deferredInstallPrompt = useRef(null);
  const [startDate, setStartDate] = useState(defaultRange.start);
  const [endDate, setEndDate] = useState(defaultRange.end);
  const [rangeWarning, setRangeWarning] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);
  const { images, isLoading, error, fetchImages } = useNasaImages(startDate, endDate);
  const fact = useMemo(() => spaceFacts[Math.floor(Math.random() * spaceFacts.length)], []);

  useEffect(() => {
    function handleBeforeInstallPrompt(event) {
      event.preventDefault();
      deferredInstallPrompt.current = event;
      setInstallPrompt(event);
    }

    function handleAppInstalled() {
      deferredInstallPrompt.current = null;
      setInstallPrompt(null);
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  useEffect(() => {
    function updateOnlineStatus() {
      setIsOnline(navigator.onLine);
    }

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
    };
  }, []);

  async function handleInstallClick() {
    const promptEvent = deferredInstallPrompt.current;
    if (!promptEvent) {
      return;
    }

    try {
      await promptEvent.prompt();
      await promptEvent.userChoice;
      deferredInstallPrompt.current = null;
      setInstallPrompt(null);
    } catch (error) {
      console.error('Unable to show the app install prompt:', error);
    }
  }

  function dismissInstallBanner() {
    deferredInstallPrompt.current = null;
    setInstallPrompt(null);
  }

  async function handleNotificationClick() {
    if (!('Notification' in window)) {
      setNotificationPermission('unsupported');
      setNotificationMessage('Notifications are not supported by this browser.');
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);

      if (permission === 'granted') {
        const notificationOptions = {
          body: 'Notifications are enabled for NASA Space Explorer.',
          icon: `${import.meta.env.BASE_URL}img/icon-192.png`,
        };
        const registration = await navigator.serviceWorker?.getRegistration();

        if (registration) {
          await registration.showNotification('NASA Space Explorer', notificationOptions);
        } else {
          new Notification('NASA Space Explorer', notificationOptions);
        }

        setNotificationMessage('A test notification was sent.');
      } else if (permission === 'denied') {
        setNotificationMessage('Notifications are blocked. Change this site’s permission in your browser settings to enable them.');
      } else {
        setNotificationMessage('Notification permission was not granted.');
      }
    } catch (error) {
      console.error('Unable to request notification permission:', error);
      setNotificationMessage('Could not enable notifications. Please try again.');
    }
  }

  function handleStartDateChange(event) {
    const nextStart = event.target.value;
    setStartDate(nextStart);
    setRangeWarning('');

    if (!nextStart) {
      return;
    }

    const tentativeEnd = new Date(`${nextStart}T00:00:00`);
    tentativeEnd.setDate(tentativeEnd.getDate() + MAX_DATE_RANGE_DAYS - 1);
    const today = new Date();
    const finalEnd = tentativeEnd > today ? formatDate(today) : formatDate(tentativeEnd);
    setEndDate(finalEnd);
    if (getDayDifference(nextStart, finalEnd) > MAX_DATE_RANGE_DAYS) {
      setRangeWarning(`Showing a ${MAX_DATE_RANGE_DAYS}-day range maximum.`);
    }
  }

  function handleEndDateChange(event) {
    const nextEnd = event.target.value;
    setRangeWarning('');

    if (!nextEnd) {
      setEndDate('');
      return;
    }

    const difference = getDayDifference(startDate, nextEnd);
    if (difference > MAX_DATE_RANGE_DAYS) {
      const trimmedEnd = new Date(`${startDate}T00:00:00`);
      trimmedEnd.setDate(trimmedEnd.getDate() + MAX_DATE_RANGE_DAYS);
      const clampedDate = formatDate(trimmedEnd);
      setEndDate(clampedDate);
      setRangeWarning(`The end date was limited to ${MAX_DATE_RANGE_DAYS} days from the start date.`);
      return;
    }

    setEndDate(nextEnd);
  }

  function closeModal() {
    setSelectedImage(null);
  }

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && selectedImage) {
        closeModal();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedImage]);

  return (
    <>
      {installPrompt && (
        <aside className="install-banner" aria-label="Install NASA Space Explorer">
          <p>Install NASA Space Explorer for quick access.</p>
          <div className="install-banner-actions">
            <button type="button" onClick={handleInstallClick}>
              Install
            </button>
            <button type="button" className="install-dismiss" onClick={dismissInstallBanner}>
              Not now
            </button>
          </div>
        </aside>
      )}

      {!isOnline && (
        <p className="offline-indicator" role="status" aria-live="polite">
          You’re offline. Previously loaded photos and app resources may still be available.
        </p>
      )}

      <div className="container">
        <header className="site-header">
          <img src="img/nasa-worm-logo.png" alt="NASA Logo" className="logo" />
          <h1>Space Explorer</h1>
        </header>

        <div className="filters">
          <div className="date-field">
            <label htmlFor="startDate">Start date</label>
            <input
              type="date"
              id="startDate"
              min={earliestDate}
              max={formatDate(new Date())}
              value={startDate}
              onChange={handleStartDateChange}
            />
          </div>
          <div className="date-field">
            <label htmlFor="endDate">End date</label>
            <input
              type="date"
              id="endDate"
              min={earliestDate}
              max={formatDate(new Date())}
              value={endDate}
              onChange={handleEndDateChange}
            />
          </div>
          <button
            type="button"
            className="search-button"
            onClick={() => {
              setHasSearched(true);
              fetchImages(startDate, endDate);
            }}
          >
            Get Space Images
          </button>
        </div>

        {rangeWarning && <p className="status-message">{rangeWarning}</p>}

        <section className="did-you-know" aria-live="polite">
          <h2>Did You Know?</h2>
          <p>{fact}</p>
          <div className="notification-controls">
            {notificationPermission === 'unsupported' ? (
              <p>Notifications are not supported by this browser.</p>
            ) : (
              <button type="button" onClick={handleNotificationClick}>
                {notificationPermission === 'granted' ? 'Send test notification' : 'Enable notifications'}
              </button>
            )}
            {notificationMessage && <p role="status">{notificationMessage}</p>}
          </div>
        </section>

        <div className="gallery">
        {isLoading && <p className="status-message">🔄 Loading space photos…</p>}
        {!hasSearched && !isLoading && (
          <div className="placeholder">
            <div className="placeholder-icon">🔭</div>
            <p>Select a date range and click "Get Space Images" to explore the cosmos!</p>
          </div>
        )}
        {hasSearched && !isLoading && !error && images.length === 0 && <p className="status-message">Choose a date range to load NASA images.</p>}
        {hasSearched && !isLoading && error && <p className="status-message error">{error}</p>}

        {images.map((spaceImage, index) => {
          const isVideo = spaceImage.media_type === 'video';
          const cardImage = isVideo ? spaceImage.thumbnail_url || 'img/nasa-worm-logo.png' : spaceImage.displayImageUrl || 'img/nasa-worm-logo.png';
          const shouldLoadImmediately = index < 4;

          return (
            <article
              key={`${spaceImage.date}-${spaceImage.title}`}
              className="gallery-item"
              tabIndex={0}
              role="button"
              aria-label={`Open details for ${spaceImage.title}`}
              onClick={() => setSelectedImage(spaceImage)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setSelectedImage(spaceImage);
                }
              }}
            >
              <LazyImage
                src={cardImage}
                alt={spaceImage.title}
                className="gallery-image"
                fallbackSrc="img/nasa-worm-logo.png"
                immediateLoad={shouldLoadImmediately}
              />
              <h2>{spaceImage.title}</h2>
              <p className="space-date">{spaceImage.date}</p>
              <p className="media-type">{isVideo ? 'Video entry' : 'Image entry'}</p>
            </article>
          );
        })}
        </div>

        {selectedImage && (
          <div className="modal" aria-hidden="false" onClick={closeModal}>
            <div className="modal-backdrop" data-close="true" />
            <div className="modal-content" role="dialog" aria-modal="true" aria-labelledby="modalTitle" onClick={(event) => event.stopPropagation()}>
              <button type="button" className="modal-close" aria-label="Close image" onClick={closeModal}>×</button>
              {selectedImage.media_type === 'video' ? (
                <a className="video-link" href={selectedImage.url} target="_blank" rel="noreferrer noopener">
                  Watch the NASA video
                </a>
              ) : (
                <img id="modalImage" src={selectedImage.displayImageUrl || selectedImage.hdurl || selectedImage.url} alt={selectedImage.title} className="modal-image" />
              )}
              <div className="modal-copy">
                <h2 id="modalTitle">{selectedImage.title}</h2>
                <p className="modal-date">{selectedImage.date}</p>
                <div dangerouslySetInnerHTML={{ __html: selectedImage.explanation || '' }} />
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default App;
