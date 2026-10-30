/**
 * script.js - 메인 캘린더 제어 스크립트
 * 위치 확인 및 상세 페이지(weather.html)로 위치 전달
 */
'use strict';

(() => {
  // 상수 정의
  const STORAGE_SCHEDULE_KEY = 'calendar_schedules';
  const STORAGE_LOCATION_KEY = 'cached_user_location';
  const DAY_NAMES = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
  const TODAY = new Date();

  // 상태 변수
  let currentYear = TODAY.getFullYear();
  let currentMonth = TODAY.getMonth(); // 0 ~ 11
  let userCoords = null; // { lat, lon, name }

  // 안전한 로컬 스토리지 읽기
  function loadSchedules() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_SCHEDULE_KEY)) || {};
    } catch (e) {
      console.warn('일정 데이터 파싱 실패:', e);
      return {};
    }
  }

  const schedules = loadSchedules();

  // DOM 캐싱
  const currentMonthYearEl = document.getElementById('current-month-year');
  const subHeaderDateEl = document.getElementById('sub-header-date');
  const locationBadgeEl = document.getElementById('location-status-badge');
  const locationTextEl = document.getElementById('location-status-text');
  const datesGridEl = document.getElementById('dates-grid');
  const prevBtn = document.getElementById('prev-btn');
  const nextBtn = document.getElementById('next-btn');
  const todayBtn = document.getElementById('today-btn');

  // 날짜 YYYY-MM-DD 변환 유틸
  function formatDateKey(year, month, day) {
    const m = String(month + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return `${year}-${m}-${d}`;
  }

  // 오늘 날짜 서브 헤더 초기화
  function initSubHeader() {
    const y = TODAY.getFullYear();
    const m = TODAY.getMonth() + 1;
    const d = TODAY.getDate();
    const dayStr = DAY_NAMES[TODAY.getDay()];
    subHeaderDateEl.textContent = `오늘은 ${y}년 ${m}월 ${d}일 ${dayStr}입니다`;
  }

  // 내 위치 확인 함수 (Geolocation 및 역지오코딩)
  function detectUserLocation(forceRefresh = false) {
    // 1. 캐시된 위치가 있다면 즉시 먼저 적용
    if (!forceRefresh) {
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_LOCATION_KEY));
        if (saved && saved.lat && saved.lon) {
          userCoords = saved;
          locationTextEl.textContent = saved.name || '내 위치 확인됨';
          locationBadgeEl.classList.add('active');
        }
      } catch (e) {
        // 캐시 파싱 에러 무시
      }
    }

    if (!navigator.geolocation) {
      userCoords = { lat: 37.5665, lon: 126.9780, name: '서울 (기본 좌표)' };
      locationTextEl.textContent = userCoords.name;
      return;
    }

    locationTextEl.textContent = '내 위치 확인 중...';

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        let placeName = '내 위치 확인됨';

        try {
          // 무료 역지오코딩으로 행정구역명 획득
          const geoRes = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=ko`);
          if (geoRes.ok) {
            const geoData = await geoRes.json();
            const district = geoData.locality || geoData.city || geoData.principalSubdivision;
            if (district) {
              placeName = `내 위치 (${district})`;
            }
          }
        } catch (e) {
          // 역지오코딩 실패 시 기본 라벨 유지
        }

        userCoords = { lat, lon, name: placeName };
        localStorage.setItem(STORAGE_LOCATION_KEY, JSON.stringify(userCoords));
        locationTextEl.textContent = placeName;
        locationBadgeEl.classList.add('active');
      },
      (err) => {
        console.warn('위치 권한 확인 실패/거부:', err.message);
        if (!userCoords) {
          userCoords = { lat: 37.5665, lon: 126.9780, name: '서울 (기본 좌표)' };
          locationTextEl.textContent = '기본 위치 (서울)';
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 60000
      }
    );
  }

  // 캘린더 렌더링 (DocumentFragment 적용하여 단 1회 DOM 마운트)
  function renderCalendar() {
    currentMonthYearEl.textContent = `${currentYear}년 ${currentMonth + 1}월`;

    const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();
    const lastDate = new Date(currentYear, currentMonth + 1, 0).getDate();
    const prevLastDate = new Date(currentYear, currentMonth, 0).getDate();
    const lastDayIndex = new Date(currentYear, currentMonth, lastDate).getDay();
    const nextDays = (7 - (lastDayIndex + 1)) % 7;

    const fragment = document.createDocumentFragment();

    // 1. 이전 달 날짜
    for (let x = firstDayIndex; x > 0; x--) {
      const day = prevLastDate - x + 1;
      const prevDate = new Date(currentYear, currentMonth - 1, day);
      fragment.appendChild(createDateCell(prevDate.getFullYear(), prevDate.getMonth(), day, true));
    }

    // 2. 현재 달 날짜
    for (let d = 1; d <= lastDate; d++) {
      fragment.appendChild(createDateCell(currentYear, currentMonth, d, false));
    }

    // 3. 다음 달 날짜
    for (let y = 1; y <= nextDays; y++) {
      const nextDate = new Date(currentYear, currentMonth + 1, y);
      fragment.appendChild(createDateCell(nextDate.getFullYear(), nextDate.getMonth(), y, true));
    }

    // 기존 그리드 교체
    datesGridEl.replaceChildren(fragment);
  }

  // 개별 날짜 셀 DOM 생성 함수
  function createDateCell(year, month, day, isOtherMonth) {
    const dateKey = formatDateKey(year, month, day);
    const dayOfWeek = new Date(year, month, day).getDay();
    const isToday = (
      TODAY.getFullYear() === year &&
      TODAY.getMonth() === month &&
      TODAY.getDate() === day
    );

    const cell = document.createElement('div');
    cell.className = 'date-cell';
    cell.tabIndex = 0;
    cell.setAttribute('role', 'button');

    if (isOtherMonth) cell.classList.add('other-month');
    if (dayOfWeek === 0) cell.classList.add('sun');
    if (dayOfWeek === 6) cell.classList.add('sat');
    if (isToday) cell.classList.add('today');

    const daySchedule = schedules[dateKey] || [];
    const scheduleCount = daySchedule.length;

    // 접근성 레이블 설정
    const labelParts = [`${year}년 ${month + 1}월 ${day}일 ${DAY_NAMES[dayOfWeek]}`];
    if (isToday) labelParts.push('오늘');
    if (scheduleCount > 0) labelParts.push(`등록된 일정 ${scheduleCount}개`);
    cell.setAttribute('aria-label', labelParts.join(', '));

    // 상단 헤더 (날짜 숫자 + 일정 인디케이터 도트)
    const cellHeader = document.createElement('div');
    cellHeader.className = 'cell-header';

    const numberSpan = document.createElement('span');
    numberSpan.className = 'date-number';
    numberSpan.textContent = day;
    cellHeader.appendChild(numberSpan);

    if (scheduleCount > 0) {
      const dotContainer = document.createElement('div');
      dotContainer.className = 'dot-container';
      const visibleDots = Math.min(scheduleCount, 3);
      for (let i = 0; i < visibleDots; i++) {
        const dot = document.createElement('span');
        dot.className = 'dot';
        dotContainer.appendChild(dot);
      }
      cellHeader.appendChild(dotContainer);
    }
    cell.appendChild(cellHeader);

    // 일정 미리보기 배지
    if (scheduleCount > 0) {
      const previewEl = document.createElement('div');
      previewEl.className = 'cell-schedule-preview';
      previewEl.textContent = daySchedule[0];
      if (scheduleCount > 1) {
        previewEl.title = daySchedule.join('\n');
      }
      cell.appendChild(previewEl);
    }

    // 상세 페이지(weather.html)로 위치 좌표(lat, lon)를 넘겨주는 네비게이션 함수
    const navigateToDetail = () => {
      let targetUrl = `weather.html?date=${dateKey}`;
      if (userCoords && userCoords.lat && userCoords.lon) {
        targetUrl += `&lat=${encodeURIComponent(userCoords.lat)}&lon=${encodeURIComponent(userCoords.lon)}`;
      }
      window.location.href = targetUrl;
    };

    cell.addEventListener('click', navigateToDetail);
    cell.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        navigateToDetail();
      }
    });

    return cell;
  }

  // 달력 네비게이션 이벤트
  prevBtn.addEventListener('click', () => {
    currentMonth--;
    if (currentMonth < 0) {
      currentMonth = 11;
      currentYear--;
    }
    renderCalendar();
  });

  nextBtn.addEventListener('click', () => {
    currentMonth++;
    if (currentMonth > 11) {
      currentMonth = 0;
      currentYear++;
    }
    renderCalendar();
  });

  todayBtn.addEventListener('click', () => {
    currentYear = TODAY.getFullYear();
    currentMonth = TODAY.getMonth();
    renderCalendar();
  });

  // 위치 뱃지 클릭 시 위치 재탐색
  if (locationBadgeEl) {
    locationBadgeEl.addEventListener('click', () => detectUserLocation(true));
  }

  // 초기화 실행
  initSubHeader();
  renderCalendar();
  detectUserLocation();
})();
