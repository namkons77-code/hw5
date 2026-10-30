/**
 * weather.js - 상세 날씨 및 일정 관리 스크립트
 * index.html에서 전달된 위치(lat, lon) 우선 처리 및 캐싱
 */
'use strict';

(() => {
  // WMO 날씨 코드 매핑 객체
  const DESCRIPTIONS = {
    0: "맑음",
    1: "대체로 맑음",
    2: "구름 조금",
    3: "흐림",
    45: "안개",
    48: "빙무(서리 안개)",
    51: "약한 이슬비",
    53: "보통 이슬비",
    55: "강한 이슬비",
    56: "약한 동결성 이슬비",
    57: "강한 동결성 이슬비",
    61: "약한 비",
    63: "보통 비",
    65: "강한 비",
    66: "약한 어는 비",
    67: "강한 어는 비",
    71: "약한 눈",
    73: "보통 눈",
    75: "강한 눈(폭설)",
    77: "싸락눈",
    80: "약한 소나기",
    81: "보통 소나기",
    82: "강한 소나기",
    85: "약한 눈 소나기",
    86: "강한 눈 소나기",
    95: "뇌우",
    96: "약한 우박을 동반한 뇌우",
    99: "강한 우박을 동반한 뇌우",
  };

  const DAY_NAMES = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
  const STORAGE_SCHEDULE_KEY = 'calendar_schedules';
  const STORAGE_LOCATION_KEY = 'cached_user_location';
  const TODAY = new Date();

  // URL에서 초기 날짜 가져오기
  function getInitialDate() {
    const params = new URLSearchParams(window.location.search);
    const dateParam = params.get('date');
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      const [y, m, d] = dateParam.split('-').map(Number);
      return new Date(y, m - 1, d);
    }
    return new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
  }

  // 상태 변수
  let currentDate = getInitialDate();
  let weatherCache = {};
  let activeCoords = null; // { lat, lon, name }

  // 안전한 스케줄 로드
  function loadSchedules() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_SCHEDULE_KEY)) || {};
    } catch (e) {
      console.warn('일정 데이터 파싱 실패:', e);
      return {};
    }
  }

  let schedules = loadSchedules();

  // DOM 캐싱
  const selectedDateTitleEl = document.getElementById('selected-date-title');
  const selectedDayBadgeEl = document.getElementById('selected-day-badge');
  const detailLocationNameEl = document.getElementById('detail-location-name');
  const locationRefreshBtn = document.getElementById('location-refresh-btn');

  const weatherDetailIconEl = document.getElementById('weather-detail-icon');
  const weatherDetailDescEl = document.getElementById('weather-detail-desc');
  const weatherDetailTempEl = document.getElementById('weather-detail-temp');

  const scheduleCountEl = document.getElementById('schedule-count');
  const scheduleForm = document.getElementById('schedule-form');
  const scheduleInput = document.getElementById('schedule-input');
  const scheduleListEl = document.getElementById('schedule-list');

  const prevDayBtn = document.getElementById('prev-day-btn');
  const nextDayBtn = document.getElementById('next-day-btn');
  const todayDayBtn = document.getElementById('today-day-btn');

  // 날짜 YYYY-MM-DD 변환 유틸
  function formatDateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // 날씨 코드에 대응하는 아이콘 및 색상 클래스
  function getWeatherIconInfo(code) {
    if (code === 0) return { icon: 'fa-sun', colorClass: 'weather-sun' };
    if (code === 1 || code === 2) return { icon: 'fa-cloud-sun', colorClass: 'weather-cloud-sun' };
    if (code === 3) return { icon: 'fa-cloud', colorClass: 'weather-cloud' };
    if (code === 45 || code === 48) return { icon: 'fa-smog', colorClass: 'weather-fog' };
    if ([51, 53, 55, 56, 57].includes(code)) return { icon: 'fa-cloud-rain', colorClass: 'weather-rain' };
    if ([61, 63, 65, 66, 67].includes(code)) return { icon: 'fa-cloud-showers-heavy', colorClass: 'weather-rain-heavy' };
    if ([71, 73, 75, 77].includes(code)) return { icon: 'fa-snowflake', colorClass: 'weather-snow' };
    if ([80, 81, 82].includes(code)) return { icon: 'fa-cloud-sun-rain', colorClass: 'weather-shower' };
    if (code === 85 || code === 86) return { icon: 'fa-snowflake', colorClass: 'weather-snow' };
    if ([95, 96, 99].includes(code)) return { icon: 'fa-cloud-bolt', colorClass: 'weather-thunder' };
    return { icon: 'fa-cloud', colorClass: 'weather-cloud' };
  }

  // Open-Meteo 날씨 가져오기 (세션 캐시 지원)
  async function fetchWeather(lat, lon) {
    const cacheKey = `weather_${lat.toFixed(2)}_${lon.toFixed(2)}`;
    const sessionCached = sessionStorage.getItem(cacheKey);

    if (sessionCached) {
      try {
        weatherCache = JSON.parse(sessionCached);
        renderPage();
        return;
      } catch (e) {
        // 캐시 파싱 에러 시 재요청
      }
    }

    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&past_days=92&forecast_days=16`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP Error ${res.status}`);

      const data = await res.json();
      if (data && data.daily) {
        weatherCache = {};
        const { time, weather_code, temperature_2m_max, temperature_2m_min } = data.daily;

        time.forEach((dateStr, idx) => {
          const code = weather_code[idx];
          weatherCache[dateStr] = {
            code,
            description: DESCRIPTIONS[code] ?? "기타",
            maxTemp: Math.round(temperature_2m_max[idx]),
            minTemp: Math.round(temperature_2m_min[idx])
          };
        });

        sessionStorage.setItem(cacheKey, JSON.stringify(weatherCache));
        renderPage();
      }
    } catch (err) {
      console.error('날씨 데이터 로드 실패:', err);
      weatherDetailDescEl.textContent = '날씨 정보를 불러오지 못했습니다.';
    }
  }

  // 위치 초기화: index.html에서 전달된 좌표(lat, lon)를 최우선으로 적용
  async function initLocation(forceRefresh = false) {
    const urlParams = new URLSearchParams(window.location.search);
    const passedLat = parseFloat(urlParams.get('lat'));
    const passedLon = parseFloat(urlParams.get('lon'));

    // 1. URL 파라미터로 유효한 좌표가 넘어온 경우 (index.html에서 전달)
    if (!forceRefresh && !isNaN(passedLat) && !isNaN(passedLon)) {
      let placeName = '현재 위치';
      // 로컬 캐시에서 동일 좌표의 명칭이 있는지 확인
      try {
        const cached = JSON.parse(localStorage.getItem(STORAGE_LOCATION_KEY));
        if (cached && Math.abs(cached.lat - passedLat) < 0.05 && Math.abs(cached.lon - passedLon) < 0.05) {
          placeName = cached.name;
        }
      } catch (e) {}

      activeCoords = { lat: passedLat, lon: passedLon, name: placeName };
      detailLocationNameEl.textContent = placeName;
      fetchWeather(passedLat, passedLon);

      // 상세 행정구역명이 없는 경우 백그라운드에서 역지오코딩 시도
      if (placeName === '현재 위치') {
        try {
          const geoRes = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${passedLat}&longitude=${passedLon}&localityLanguage=ko`);
          if (geoRes.ok) {
            const geoData = await geoRes.json();
            const district = geoData.locality || geoData.city || geoData.principalSubdivision;
            if (district) {
              placeName = `현재 위치 (${district})`;
              activeCoords.name = placeName;
              detailLocationNameEl.textContent = placeName;
              localStorage.setItem(STORAGE_LOCATION_KEY, JSON.stringify(activeCoords));
            }
          }
        } catch (e) {}
      }
      return;
    }

    // 2. 캐시된 위치가 있다면 즉시 먼저 표시
    if (!forceRefresh) {
      const savedLocation = localStorage.getItem(STORAGE_LOCATION_KEY);
      if (savedLocation) {
        try {
          const loc = JSON.parse(savedLocation);
          if (loc && loc.lat && loc.lon) {
            activeCoords = loc;
            detailLocationNameEl.textContent = loc.name || '현재 위치';
            fetchWeather(loc.lat, loc.lon);
            return;
          }
        } catch (e) {}
      }
    }

    // 3. 브라우저 위치 확인
    if (!navigator.geolocation) {
      activeCoords = { lat: 37.5665, lon: 126.9780, name: '현재 위치 (기본 좌표)' };
      detailLocationNameEl.textContent = activeCoords.name;
      fetchWeather(activeCoords.lat, activeCoords.lon);
      return;
    }

    detailLocationNameEl.textContent = '현재 위치 확인 중...';

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        let placeName = '현재 위치';

        try {
          const geoRes = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=ko`);
          if (geoRes.ok) {
            const geoData = await geoRes.json();
            const district = geoData.locality || geoData.city || geoData.principalSubdivision;
            if (district) {
              placeName = `현재 위치 (${district})`;
            }
          }
        } catch (e) {}

        activeCoords = { lat, lon, name: placeName };
        detailLocationNameEl.textContent = placeName;
        localStorage.setItem(STORAGE_LOCATION_KEY, JSON.stringify(activeCoords));
        fetchWeather(lat, lon);
      },
      (err) => {
        console.warn('위치 접근 제한:', err.message);
        activeCoords = { lat: 37.5665, lon: 126.9780, name: '현재 위치 (기본 좌표)' };
        detailLocationNameEl.textContent = activeCoords.name;
        fetchWeather(activeCoords.lat, activeCoords.lon);
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 120000
      }
    );
  }

  // 화면 렌더링
  function renderPage() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;
    const day = currentDate.getDate();
    const dayOfWeek = DAY_NAMES[currentDate.getDay()];
    const dateKey = formatDateKey(currentDate);

    // 헤더 텍스트
    selectedDateTitleEl.textContent = `${year}년 ${month}월 ${day}일 (${dayOfWeek[0]})`;

    // 오늘 / D-day 배지
    const isToday = (
      TODAY.getFullYear() === year &&
      TODAY.getMonth() === currentDate.getMonth() &&
      TODAY.getDate() === day
    );

    if (isToday) {
      selectedDayBadgeEl.textContent = '오늘';
      selectedDayBadgeEl.style.display = 'inline-block';
    } else {
      const oneDay = 86400000;
      const targetMidnight = new Date(year, currentDate.getMonth(), day);
      const todayMidnight = new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
      const diffDays = Math.round((targetMidnight - todayMidnight) / oneDay);

      if (diffDays > 0) {
        selectedDayBadgeEl.textContent = `D-${diffDays}`;
        selectedDayBadgeEl.style.display = 'inline-block';
      } else if (diffDays < 0) {
        selectedDayBadgeEl.textContent = `${Math.abs(diffDays)}일 전`;
        selectedDayBadgeEl.style.display = 'inline-block';
      } else {
        selectedDayBadgeEl.style.display = 'none';
      }
    }

    // 날씨 카드 렌더링
    const weatherInfo = weatherCache[dateKey];
    if (weatherInfo) {
      const { icon, colorClass } = getWeatherIconInfo(weatherInfo.code);
      weatherDetailIconEl.className = `fa-solid ${icon} detail-weather-icon ${colorClass}`;
      weatherDetailDescEl.textContent = weatherInfo.description;
      weatherDetailTempEl.textContent = `최고 ${weatherInfo.maxTemp}℃ / 최저 ${weatherInfo.minTemp}℃`;
    } else {
      weatherDetailIconEl.className = 'fa-solid fa-cloud detail-weather-icon weather-cloud';
      weatherDetailDescEl.textContent = '날씨 정보 로딩 중...';
      weatherDetailTempEl.textContent = '최고 --℃ / 최저 --℃';
    }

    // 일정 목록 렌더링
    renderScheduleList(dateKey);

    // URL 동기화 (전달받은 위치 파라미터 유지)
    let newUrl = `${window.location.pathname}?date=${dateKey}`;
    if (activeCoords && activeCoords.lat && activeCoords.lon) {
      newUrl += `&lat=${encodeURIComponent(activeCoords.lat)}&lon=${encodeURIComponent(activeCoords.lon)}`;
    }
    window.history.replaceState({ path: newUrl }, '', newUrl);
  }

  // 일정 목록 렌더링 (DocumentFragment 적용)
  function renderScheduleList(dateKey) {
    const daySchedules = schedules[dateKey] || [];
    scheduleCountEl.textContent = `${daySchedules.length}개`;

    if (daySchedules.length === 0) {
      scheduleListEl.innerHTML = `
        <div class="empty-message">
          <i class="fa-regular fa-calendar-check"></i>
          <p>이 날짜에 등록된 일정이 없습니다.</p>
        </div>
      `;
      return;
    }

    const fragment = document.createDocumentFragment();

    daySchedules.forEach((text, index) => {
      const li = document.createElement('li');
      li.className = 'schedule-item';

      const span = document.createElement('span');
      span.textContent = text;

      const delBtn = document.createElement('button');
      delBtn.className = 'delete-btn';
      delBtn.type = 'button';
      delBtn.setAttribute('aria-label', `일정 "${text}" 삭제`);
      delBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
      delBtn.title = '일정 삭제';
      delBtn.addEventListener('click', () => deleteSchedule(dateKey, index));

      li.appendChild(span);
      li.appendChild(delBtn);
      fragment.appendChild(li);
    });

    scheduleListEl.replaceChildren(fragment);
  }

  // 일정 추가
  scheduleForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = scheduleInput.value.trim();
    if (!text) return;

    const dateKey = formatDateKey(currentDate);
    if (!schedules[dateKey]) schedules[dateKey] = [];
    schedules[dateKey].push(text);

    localStorage.setItem(STORAGE_SCHEDULE_KEY, JSON.stringify(schedules));
    scheduleInput.value = '';
    renderScheduleList(dateKey);
  });

  // 일정 삭제
  function deleteSchedule(dateKey, index) {
    if (!schedules[dateKey]) return;
    schedules[dateKey].splice(index, 1);
    if (schedules[dateKey].length === 0) delete schedules[dateKey];

    localStorage.setItem(STORAGE_SCHEDULE_KEY, JSON.stringify(schedules));
    renderScheduleList(dateKey);
  }

  // 날짜 변경 함수
  function changeDate(daysOffset) {
    currentDate.setDate(currentDate.getDate() + daysOffset);
    renderPage();
  }

  // 네비게이션 이벤트
  prevDayBtn.addEventListener('click', () => changeDate(-1));
  nextDayBtn.addEventListener('click', () => changeDate(1));
  todayDayBtn.addEventListener('click', () => {
    currentDate = new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
    renderPage();
  });

  // 위치 새로고침
  if (locationRefreshBtn) {
    locationRefreshBtn.addEventListener('click', () => initLocation(true));
  }

  // 초기 실행
  renderPage();
  initLocation();
})();
