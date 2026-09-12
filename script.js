import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, getDocs, getDoc, setDoc, doc, query, orderBy, writeBatch, serverTimestamp, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, setPersistence, browserLocalPersistence, browserSessionPersistence } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyCj1poSyx9DNXgeA27BP4-M-F1KV5ETFRI",
    authDomain: "chamcong-19c27.firebaseapp.com",
    projectId: "chamcong-19c27",
    storageBucket: "chamcong-19c27.firebasestorage.app",
    messagingSenderId: "649644002364",
    appId: "1:649644002364:web:b7b3e9feb2789ee7880739",
    measurementId: "G-FGLZF738T0"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const authScreen = document.getElementById('authScreen');
const appScreen = document.getElementById('appScreen');
const loginForm = document.getElementById('loginForm');
const authError = document.getElementById('authError');
const loginBtn = document.getElementById('loginBtn');
const adminEmail = 'admin@gmail.com';
let loginAsAdmin = false;
let currentUser = null;
let attendanceCollection = null;
let employees = [];
let employeeAttendance = new Map();

const pageLoader = document.getElementById('pageLoader');
const pageLoaderText = document.getElementById('pageLoaderText');

function showPageLoader(message = 'Đang tải dữ liệu...') {
    pageLoaderText.textContent = message;
    pageLoader.classList.remove('is-hidden');
}

function hidePageLoader() {
    pageLoader.classList.add('is-hidden');
}

function createAttendanceSkeleton() {
    return Array.from({ length: 3 }, () => `
                <div class="skeleton-item" aria-hidden="true">
                    <div>
                        <div class="skeleton-line wide"></div>
                        <div class="skeleton-line short"></div>
                    </div>
                    <div class="skeleton-pill"></div>
                </div>
            `).join('');
}

function createEmployeeSkeleton() {
    return Array.from({ length: 3 }, () => `
                <div class="employee-row" aria-hidden="true">
                    <div>
                        <div class="skeleton-line wide"></div>
                        <div class="skeleton-line short"></div>
                    </div>
                    <div class="skeleton-pill"></div>
                </div>
            `).join('');
}

function showAuthError(error) {
    const messages = {
        'auth/invalid-credential': 'Tên đăng nhập hoặc mật khẩu không đúng.',
        'auth/invalid-email': 'Tên đăng nhập không hợp lệ.',
        'auth/admin-email-required': 'Chế độ quản trị yêu cầu tài khoản admin@gmail.com.'
    };
    authError.textContent = messages[error.code] || 'Không thể đăng nhập. Vui lòng thử lại.';
}

function normalizeLoginIdentifier(value) {
    const identifier = value.trim().toLowerCase();
    return identifier.includes('@') ? identifier : `${identifier}@chamcong.local`;
}

function setLoginMode(asAdmin) {
    loginAsAdmin = asAdmin;
    const employeeMode = document.getElementById('employeeLoginMode');
    const adminMode = document.getElementById('adminLoginMode');
    employeeMode.classList.toggle('active', !asAdmin);
    adminMode.classList.toggle('active', asAdmin);
    document.querySelector('.login-mode')?.classList.toggle('is-admin', asAdmin);
    employeeMode.setAttribute('aria-selected', String(!asAdmin));
    adminMode.setAttribute('aria-selected', String(asAdmin));
    document.getElementById('authDescription').textContent = asAdmin
        ? 'Đăng nhập bằng tài khoản quản trị để quản lý nhân viên.'
        : 'Sử dụng tài khoản được cấp để xem dữ liệu cá nhân.';
}

document.getElementById('employeeLoginMode').addEventListener('click', () => setLoginMode(false));
document.getElementById('adminLoginMode').addEventListener('click', () => setLoginMode(true));

const togglePasswordBtn = document.getElementById('togglePasswordBtn');
if (togglePasswordBtn) {
    togglePasswordBtn.addEventListener('click', () => {
        const passwordInput = document.getElementById('loginPassword');
        const isHidden = passwordInput.type === 'password';
        passwordInput.type = isHidden ? 'text' : 'password';
        togglePasswordBtn.textContent = isHidden ? '🙈' : '👁';
        togglePasswordBtn.setAttribute('aria-label', isHidden ? 'Ẩn mật khẩu' : 'Hiện mật khẩu');
    });
}

function setLoginButtonLabel(text) {
    const loginBtnText = document.getElementById('loginBtnText');
    if (loginBtnText) loginBtnText.textContent = text;
    else loginBtn.textContent = text;
}

function resetLoginForm() {
    loginForm.reset();
    document.getElementById('loginEmail').value = '';
    document.getElementById('loginPassword').value = '';
    document.getElementById('loginPassword').type = 'password';
    document.getElementById('authError').textContent = '';
    document.getElementById('loginBtn').disabled = false;
    document.getElementById('togglePasswordBtn').textContent = '👁';
    document.getElementById('togglePasswordBtn').setAttribute('aria-label', 'Hiện mật khẩu');
    setLoginButtonLabel('Đăng nhập');
    setLoginMode(false);
}

loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    authError.textContent = '';
    loginBtn.disabled = true;
    setLoginButtonLabel('Đang đăng nhập...');
    try {
        const rememberLogin = document.getElementById('rememberLogin')?.checked ?? true;
        await setPersistence(auth, rememberLogin ? browserLocalPersistence : browserSessionPersistence);
        const email = normalizeLoginIdentifier(document.getElementById('loginEmail').value);
        if (loginAsAdmin && email !== adminEmail) {
            throw { code: 'auth/admin-email-required' };
        }
        await signInWithEmailAndPassword(auth, email, document.getElementById('loginPassword').value);
    } catch (error) {
        console.error(error);
        showAuthError(error);
    } finally {
        loginBtn.disabled = false;
        setLoginButtonLabel('Đăng nhập');
    }
});

document.getElementById('logoutBtn').addEventListener('click', () => signOut(auth));

// Dark Mode Toggle
function initializeDarkMode() {
    const darkModeEnabled = localStorage.getItem('attendance-dark-mode') === 'true';
    const darkModeBtn = document.getElementById('darkModeBtn');
    const themeColor = document.querySelector('meta[name="theme-color"]');

    if (darkModeEnabled) {
        document.body.classList.add('dark-mode');
        if (darkModeBtn) darkModeBtn.textContent = '☀️';
        if (themeColor) themeColor.setAttribute('content', '#0a1826');
    }

    if (darkModeBtn) {
        darkModeBtn.addEventListener('click', () => {
            document.body.classList.toggle('dark-mode');
            const isDarkMode = document.body.classList.contains('dark-mode');
            localStorage.setItem('attendance-dark-mode', isDarkMode);
            darkModeBtn.textContent = isDarkMode ? '☀️' : '◐';
            if (themeColor) themeColor.setAttribute('content', isDarkMode ? '#0a1826' : '#0f2744');
        });
    }
}

initializeDarkMode();

function getInitials(name) {
    const parts = String(name || '')
        .replace(/Xin chào,?\s*/i, '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
    if (!parts.length) return 'U';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function updateUserAvatar(displayName) {
    const avatar = document.getElementById('userAvatar');
    if (avatar) avatar.textContent = getInitials(displayName);
}

function formatDisplayDate(dateStr) {
    if (!dateStr || dateStr.length < 10) return dateStr || '';
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
}

function updateTodayStatusCard() {
    const card = document.getElementById('todayStatusCard');
    const label = document.getElementById('todayStatusLabel');
    const hint = document.getElementById('todayStatusHint');
    const checkInLabel = document.getElementById('todayCheckInLabel');
    const checkOutLabel = document.getElementById('todayCheckOutLabel');
    if (!card || !label || !hint || !checkInLabel || !checkOutLabel) return;

    card.classList.remove('is-work', 'is-leave', 'is-late', 'is-partial', 'is-done');

    if (todayHoliday) {
        label.textContent = `Nghỉ lễ: ${todayHoliday.name}`;
        hint.textContent = 'Hôm nay là ngày nghỉ theo quy định. Không cần chấm công.';
        checkInLabel.textContent = '—';
        checkOutLabel.textContent = '—';
        card.classList.add('is-leave');
        return;
    }

    if (!todayExistingRecord) {
        label.textContent = 'Chưa chấm công';
        hint.textContent = 'Hãy ghi nhận giờ vào khi bắt đầu ca làm.';
        checkInLabel.textContent = '--:--';
        checkOutLabel.textContent = '--:--';
        return;
    }

    const status = getEffectiveStatus(todayExistingRecord);
    const checkIn = todayExistingRecord.checkIn || 'Chưa chấm';
    const checkOut = todayExistingRecord.checkOut || 'Chưa chấm';
    label.textContent = status;
    checkInLabel.textContent = checkIn === 'Nghỉ' ? 'Nghỉ' : (checkIn === 'Chưa chấm' ? '--:--' : checkIn);
    checkOutLabel.textContent = checkOut === 'Nghỉ' ? 'Nghỉ' : (checkOut === 'Chưa chấm' ? '--:--' : checkOut);

    if (status.includes('Nghỉ')) {
        hint.textContent = 'Đã ghi nhận ngày nghỉ cho hôm nay.';
        card.classList.add('is-leave');
    } else if (status === 'Quên chấm công') {
        hint.textContent = 'Hôm nay đã quá hạn chấm công vào.';
        card.classList.add('is-late');
    } else if (checkIn !== 'Chưa chấm' && checkOut !== 'Chưa chấm') {
        hint.textContent = 'Đã hoàn tất chấm công vào và ra.';
        card.classList.add('is-done');
    } else if (checkIn !== 'Chưa chấm') {
        hint.textContent = 'Đã chấm vào. Nhớ chấm ra sau 12:00.';
        card.classList.add(status === 'Đi trễ' ? 'is-late' : 'is-partial');
    } else {
        hint.textContent = 'Đang chờ ghi nhận giờ vào.';
        card.classList.add('is-partial');
    }
}

function updateMonthStats() {
    const month = document.getElementById('reportMonth')?.value || todayStr.slice(0, 7);
    const monthData = globalAttendanceData.filter(item => item?.date?.startsWith(month));
    let work = 0;
    let leave = 0;
    let late = 0;
    let missing = 0;

    monthData.forEach(item => {
        const status = getEffectiveStatus(item);
        if (status.includes('Nghỉ')) {
            leave += 1;
        } else {
            work += 1;
            if (status === 'Đi trễ') late += 1;
            if (hasMissingTime(item)) missing += 1;
        }
    });

    const setStat = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = String(value);
    };
    setStat('statWorkDays', work);
    setStat('statLeaveDays', leave);
    setStat('statLateDays', late);
    setStat('statMissingDays', missing);
}

function updateLiveClock() {
    const timeElement = document.getElementById('liveClockTime');
    const dateElement = document.getElementById('liveClockDate');
    if (!timeElement || !dateElement) return;

    const now = new Date();
    timeElement.textContent = new Intl.DateTimeFormat('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }).format(now);
    dateElement.textContent = new Intl.DateTimeFormat('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        weekday: 'long',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    }).format(now);
}

updateLiveClock();
window.liveClockTimer = setInterval(updateLiveClock, 1000);

function getUserAttendanceCollection() {
    if (!currentUser) throw new Error('Chưa đăng nhập');
    return collection(db, 'users', currentUser.uid, 'attendance');
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[character]));
}

function getTodayKey() {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    return `${parts.find(p => p.type === 'year').value}-${parts.find(p => p.type === 'month').value}-${parts.find(p => p.type === 'day').value}`;
}

const todayStr = getTodayKey();
const dateInput = document.getElementById('date');
dateInput.value = todayStr;
dateInput.max = todayStr;
dateInput.min = todayStr;
const todayStamp = document.getElementById('todayStamp');
if (todayStamp) {
    todayStamp.textContent = new Intl.DateTimeFormat('vi-VN', {
        day: '2-digit', month: '2-digit'
    }).format(new Date(`${todayStr}T00:00:00`));
    todayStamp.nextElementSibling.textContent = new Intl.DateTimeFormat('vi-VN', {
        month: 'long', year: 'numeric'
    }).format(new Date(`${todayStr}T00:00:00`));
}
document.getElementById('reportMonth').value = todayStr.slice(0, 7);

let globalAttendanceData = [];
let todayExistingRecord = null;
const fixedHolidayNames = {
    '01-01': 'Tết Dương lịch',
    '04-30': 'Ngày Giải phóng miền Nam',
    '05-01': 'Ngày Quốc tế Lao động',
    '09-02': 'Quốc khánh'
};
const fixedObservanceNames = {
    '02-14': 'Ngày Valentine',
    '03-08': 'Ngày Quốc tế Phụ nữ',
    '05-19': 'Ngày sinh Chủ tịch Hồ Chí Minh',
    '06-01': 'Ngày Quốc tế Thiếu nhi',
    '07-27': 'Ngày Thương binh - Liệt sĩ',
    '10-20': 'Ngày Phụ nữ Việt Nam',
    '11-20': 'Ngày Nhà giáo Việt Nam',
    '12-22': 'Ngày thành lập Quân đội Nhân dân Việt Nam',
    '12-24': 'Đêm Giáng sinh',
    '12-25': 'Lễ Giáng sinh (Noel)'
};
function getHolidayInfo(date) {
    if (typeof date !== 'string' || date.length < 10) return null;
    const monthDay = date.slice(5);
    const officialName = fixedHolidayNames[monthDay];
    if (officialName) return { name: officialName, date, official: true };
    const observanceName = fixedObservanceNames[monthDay];
    if (observanceName) return { name: observanceName, date, official: false };
    const lunar = solarToLunar(Number(date.slice(8, 10)), Number(date.slice(5, 7)), Number(date.slice(0, 4)));
    const lunarKey = `${lunar.day}-${lunar.month}`;
    if (lunar.month === 1 && lunar.day >= 1 && lunar.day <= 5) {
        return { name: 'Tết Nguyên đán', date, official: true };
    }
    if (lunar.day === 10 && lunar.month === 3) {
        return { name: 'Giỗ Tổ Hùng Vương', date, official: true };
    }
    const lunarObservances = {
        '15-1': 'Rằm tháng Giêng',
        '15-4': 'Lễ Phật Đản',
        '15-7': 'Lễ Vu Lan',
        '15-8': 'Tết Trung thu',
        '23-12': 'Ngày Ông Công, Ông Táo'
    };
    const lunarObservanceName = lunarObservances[lunarKey];
    return lunarObservanceName ? { name: lunarObservanceName, date, official: false } : null;
}

const todayHoliday = getHolidayInfo(todayStr);
const MIN_CALENDAR_YEAR = 1900;
const MAX_CALENDAR_YEAR = 2100;
let calendarCursor = new Date(Number(todayStr.slice(0, 4)), Number(todayStr.slice(5, 7)) - 1, 1);

function jdFromDate(day, month, year) {
    const a = Math.floor((14 - month) / 12);
    const y = year + 4800 - a;
    const m = month + 12 * a - 3;
    return day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4)
        - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
}

function newMoonDay(k, timeZone) {
    const t = k / 1236.85;
    const t2 = t * t;
    const t3 = t2 * t;
    const dr = Math.PI / 180;
    let jd1 = 2415020.75933 + 29.53058868 * k + 0.0001178 * t2 - 0.000000155 * t3;
    jd1 += 0.00033 * Math.sin((166.56 + 132.87 * t - 0.009173 * t2) * dr);
    const m = 359.2242 + 29.1053567 * k - 0.0000333 * t2 - 0.00000347 * t3;
    const mpr = 306.0253 + 385.81691806 * k + 0.0107306 * t2 + 0.00001236 * t3;
    const f = 21.2964 + 390.67050646 * k - 0.0016528 * t2 - 0.00000239 * t3;
    let c1 = (0.1734 - 0.000393 * t) * Math.sin(m * dr) + 0.0021 * Math.sin(2 * m * dr);
    c1 -= 0.4068 * Math.sin(mpr * dr) + 0.0161 * Math.sin(2 * mpr * dr);
    c1 -= 0.0004 * Math.sin(3 * mpr * dr) + 0.0104 * Math.sin(2 * f * dr);
    c1 -= 0.0051 * Math.sin((m + mpr) * dr) + 0.0074 * Math.sin((m - mpr) * dr);
    c1 += 0.0004 * Math.sin((2 * f + m) * dr) - 0.0004 * Math.sin((2 * f - m) * dr);
    c1 -= 0.0006 * Math.sin((2 * f + mpr) * dr) + 0.0010 * Math.sin((2 * f - mpr) * dr);
    c1 += 0.0005 * Math.sin((2 * mpr + m) * dr);
    const delta = t < -11 ? 0.001 + 0.000839 * t + 0.0002261 * t2 - 0.00000845 * t3 - 0.000000081 * t * t3 : 0.001;
    return Math.floor(jd1 + c1 - delta + 0.5 + timeZone / 24);
}

function sunLongitude(jdn) {
    const t = (jdn - 2451545.5) / 36525;
    const t2 = t * t;
    const dr = Math.PI / 180;
    const m = 357.52910 + 35999.05030 * t - 0.0001559 * t2 - 0.00000048 * t * t2;
    const l0 = 280.46645 + 36000.76983 * t + 0.0003032 * t2;
    const dl = (1.914600 - 0.004817 * t - 0.000014 * t2) * Math.sin(dr * m)
        + (0.019993 - 0.000101 * t) * Math.sin(2 * dr * m) + 0.000290 * Math.sin(3 * dr * m);
    return Math.floor((l0 + dl) / 30 * 2) % 12;
}

function lunarMonth11(year, timeZone) {
    const off = jdFromDate(31, 12, year) - 2415021;
    const k = Math.floor(off / 29.530588853);
    const sunLong = sunLongitude(newMoonDay(k, timeZone));
    return sunLong >= 9 ? newMoonDay(k - 1, timeZone) : newMoonDay(k, timeZone);
}

function lunarLeapMonthOffset(a11, timeZone) {
    const k = Math.floor(0.5 + (a11 - 2415021.076998695) / 29.530588853);
    let last = 0;
    let i = 1;
    let arc = sunLongitude(newMoonDay(k + i, timeZone));
    do {
        last = arc;
        i++;
        arc = sunLongitude(newMoonDay(k + i, timeZone));
    } while (arc !== last && i < 14);
    return i - 1;
}

function solarToLunar(day, month, year) {
    const timeZone = 7;
    const dayNumber = jdFromDate(day, month, year);
    const k = Math.floor((dayNumber - 2415021.076998695) / 29.530588853);
    let monthStart = newMoonDay(k + 1, timeZone);
    if (monthStart > dayNumber) monthStart = newMoonDay(k, timeZone);
    let a11 = lunarMonth11(year, timeZone);
    let b11 = a11;
    let lunarYear = year;
    if (a11 >= monthStart) {
        a11 = lunarMonth11(year - 1, timeZone);
        lunarYear = year;
    } else {
        b11 = lunarMonth11(year + 1, timeZone);
        lunarYear = year + 1;
    }
    const lunarDay = dayNumber - monthStart + 1;
    const diff = Math.floor((monthStart - a11) / 29);
    let lunarMonth = diff + 11;
    let lunarLeap = 0;
    if (b11 - a11 > 365) {
        const leapMonthDiff = lunarLeapMonthOffset(a11, timeZone);
        if (diff >= leapMonthDiff) {
            lunarMonth = diff + 10;
            if (diff === leapMonthDiff) lunarLeap = 1;
        }
    }
    if (lunarMonth > 12) lunarMonth -= 12;
    if (lunarMonth >= 11 && diff < 4) lunarYear--;
    return { day: lunarDay, month: lunarMonth, year: lunarYear, leap: lunarLeap };
}

function lunarDateLabel(date) {
    const lunar = solarToLunar(Number(date.slice(8, 10)), Number(date.slice(5, 7)), Number(date.slice(0, 4)));
    return `${lunar.day}/${lunar.month}${lunar.leap ? ' nhuận' : ''}`;
}

function getHolidayDetail(date) {
    const holiday = getHolidayInfo(date);
    if (!holiday) return null;
    const details = {
        'Tết Dương lịch': 'Ngày nghỉ đầu năm dương lịch theo Bộ luật Lao động.',
        'Tết Nguyên đán': 'Người lao động được nghỉ 05 ngày Tết Âm lịch; ngày nghỉ cụ thể hằng năm do cơ quan có thẩm quyền thông báo.',
        'Giỗ Tổ Hùng Vương': 'Ngày 10 tháng 3 Âm lịch, tưởng nhớ các Vua Hùng.',
        'Ngày Giải phóng miền Nam': 'Ngày 30/4, kỷ niệm Ngày Giải phóng miền Nam, thống nhất đất nước.',
        'Ngày Quốc tế Lao động': 'Ngày 01/5, Ngày Quốc tế Lao động.',
        'Quốc khánh': 'Ngày 02/9 và 01 ngày liền kề theo phương án nghỉ được công bố hằng năm.',
        'Ngày Valentine': 'Ngày lễ tình yêu phổ biến trên thế giới, không phải ngày nghỉ lễ bắt buộc.',
        'Ngày Quốc tế Phụ nữ': 'Ngày 08/3, tôn vinh phụ nữ trên toàn thế giới; không phải ngày nghỉ lễ bắt buộc.',
        'Ngày sinh Chủ tịch Hồ Chí Minh': 'Ngày 19/5, ngày kỷ niệm thường được tổ chức trên toàn quốc.',
        'Ngày Quốc tế Thiếu nhi': 'Ngày 01/6 dành cho trẻ em; không phải ngày nghỉ lễ bắt buộc.',
        'Ngày Thương binh - Liệt sĩ': 'Ngày 27/7, tri ân thương binh, liệt sĩ và người có công với cách mạng.',
        'Ngày Phụ nữ Việt Nam': 'Ngày 20/10, ngày kỷ niệm và tôn vinh phụ nữ Việt Nam.',
        'Ngày Nhà giáo Việt Nam': 'Ngày 20/11, ngày tri ân các nhà giáo Việt Nam.',
        'Ngày thành lập Quân đội Nhân dân Việt Nam': 'Ngày 22/12, đồng thời là Ngày hội Quốc phòng toàn dân.',
        'Đêm Giáng sinh': 'Đêm 24/12, ngày lễ văn hóa và tôn giáo phổ biến; không phải ngày nghỉ lễ bắt buộc.',
        'Lễ Giáng sinh (Noel)': 'Ngày 25/12, lễ Giáng sinh; không phải ngày nghỉ lễ bắt buộc theo Bộ luật Lao động.',
        'Rằm tháng Giêng': 'Ngày 15 tháng Giêng Âm lịch, ngày lễ truyền thống đầu năm.',
        'Lễ Phật Đản': 'Ngày 15 tháng 4 Âm lịch, ngày lễ quan trọng của Phật giáo.',
        'Lễ Vu Lan': 'Ngày 15 tháng 7 Âm lịch, dịp tưởng nhớ công ơn cha mẹ và tổ tiên.',
        'Tết Trung thu': 'Ngày 15 tháng 8 Âm lịch, Tết Thiếu nhi và ngày hội trăng rằm truyền thống.',
        'Ngày Ông Công, Ông Táo': 'Ngày 23 tháng Chạp Âm lịch, phong tục tiễn Ông Công, Ông Táo về trời.'
    };
    return { ...holiday, lunar: lunarDateLabel(date), detail: details[holiday.name] || 'Ngày nghỉ lễ theo quy định.' };
}

function getCalendarDateKey(year, month, day) {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    const label = document.getElementById('calendarMonthLabel');
    if (!grid || !label) return;

    const year = calendarCursor.getFullYear();
    const month = calendarCursor.getMonth();
    document.getElementById('calendarPrevBtn').disabled = year <= MIN_CALENDAR_YEAR && month === 0;
    document.getElementById('calendarNextBtn').disabled = year >= MAX_CALENDAR_YEAR && month === 11;
    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const mondayFirstOffset = (firstDay.getDay() + 6) % 7;
    const attendanceByDate = new Map(globalAttendanceData.map(item => [item?.date, item]));
    label.textContent = new Intl.DateTimeFormat('vi-VN', { month: 'long', year: 'numeric' }).format(firstDay);

    let cells = Array.from({ length: mondayFirstOffset }, () => '<span class="calendar-cell is-empty" aria-hidden="true"></span>');
    for (let day = 1; day <= daysInMonth; day++) {
        const date = getCalendarDateKey(year, month, day);
        const holiday = getHolidayInfo(date);
        const attendance = attendanceByDate.get(date);
        const dayOfWeek = new Date(year, month, day).getDay();
        const classes = ['calendar-cell'];
        if (dayOfWeek === 0 || dayOfWeek === 6) classes.push('is-weekend');
        if (attendance) {
            classes.push(getEffectiveStatus(attendance).includes('Nghỉ') ? 'is-leave' : 'is-work');
        }
        if (holiday) classes.push('is-holiday');
        if (date === todayStr) classes.push('is-today');
        const statusText = attendance ? getEffectiveStatus(attendance) : 'Chưa có dữ liệu';
        const labelText = holiday ? `${date}: ${holiday.name} - ${statusText}` : `${date}: ${statusText}`;
        const cellContent = `<span class="solar-day">${day}</span><small class="lunar-day">${lunarDateLabel(date)}</small>`;
        if (holiday) {
            cells.push(`<button class="${classes.join(' ')} is-clickable" type="button" role="gridcell" data-holiday-date="${date}" title="Bấm để xem chi tiết: ${escapeHtml(labelText)}">${cellContent}</button>`);
        } else {
            cells.push(`<span class="${classes.join(' ')}" role="gridcell" title="${escapeHtml(labelText)}">${cellContent}</span>`);
        }
    }
    grid.innerHTML = cells.join('');
    grid.querySelectorAll('[data-holiday-date]').forEach(cell => {
        cell.addEventListener('click', () => showHolidayDetail(cell.dataset.holidayDate));
    });
}

function showHolidayDetail(date) {
    const holiday = getHolidayDetail(date);
    if (!holiday) return;
    Swal.fire({
        icon: 'info',
        title: holiday.name,
        html: `<div class="holiday-dialog"><p><b>Dương lịch:</b> ${escapeHtml(date.split('-').reverse().join('/'))}</p><p><b>Âm lịch:</b> ${escapeHtml(holiday.lunar)}</p><p>${escapeHtml(holiday.detail)}</p><span class="holiday-dialog-badge">${holiday.official ? 'Ngày nghỉ hưởng lương' : 'Ngày lễ / kỷ niệm phổ biến'}</span></div>`,
        confirmButtonText: 'Đã hiểu',
        confirmButtonColor: '#4f46e5'
    });
}

document.getElementById('calendarPrevBtn').addEventListener('click', () => {
    if (calendarCursor.getFullYear() <= MIN_CALENDAR_YEAR && calendarCursor.getMonth() === 0) return;
    calendarCursor.setMonth(calendarCursor.getMonth() - 1);
    renderCalendar();
});
document.getElementById('calendarNextBtn').addEventListener('click', () => {
    if (calendarCursor.getFullYear() >= MAX_CALENDAR_YEAR && calendarCursor.getMonth() === 11) return;
    calendarCursor.setMonth(calendarCursor.getMonth() + 1);
    renderCalendar();
});
document.getElementById('calendarTodayBtn').addEventListener('click', () => {
    calendarCursor = new Date(Number(todayStr.slice(0, 4)), Number(todayStr.slice(5, 7)) - 1, 1);
    renderCalendar();
});
renderCalendar();

function hasMissingTime(item) {
    return !item.checkIn || item.checkIn === 'Chưa chấm' || !item.checkOut || item.checkOut === 'Chưa chấm';
}

function parseTime(value) {
    const match = typeof value === 'string' ? value.match(/^(\d{1,2}):(\d{2})/) : null;
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function getCurrentVietnamMinutes() {
    const vietnamParts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(new Date());
    return Number(vietnamParts.find(part => part.type === 'hour').value) * 60
        + Number(vietnamParts.find(part => part.type === 'minute').value);
}

function getEffectiveStatus(item) {
    const storedStatus = typeof item.status === 'string' ? item.status : '';
    if (storedStatus.includes('Nghỉ')) return storedStatus;

    const missingCheckIn = !item.checkIn || item.checkIn === 'Chưa chấm';
    const missingCheckOut = !item.checkOut || item.checkOut === 'Chưa chấm';
    if (!missingCheckIn && !missingCheckOut) return storedStatus || 'Không xác định';

    const currentMinutes = getCurrentVietnamMinutes();
    const isPastDate = item.date < todayStr;
    const missedCheckInDeadline = item.date === todayStr && missingCheckIn && currentMinutes > 12 * 60;
    return isPastDate || missedCheckInDeadline ? 'Quên chấm công' : storedStatus || 'Không xác định';
}

async function syncExpiredAttendanceStatus() {
    const currentMinutes = getCurrentVietnamMinutes();
    const todayRef = doc(getUserAttendanceCollection(), todayStr);
    const todaySnapshot = await getDoc(todayRef);
    const todayData = todaySnapshot.exists() ? todaySnapshot.data() : null;
    const hasLeaveStatus = todayData && typeof todayData.status === 'string' && todayData.status.includes('Nghỉ');
    const missingCheckIn = !todayData || !todayData.checkIn || todayData.checkIn === 'Chưa chấm';
    const missedCheckInDeadline = missingCheckIn && currentMinutes > 12 * 60;
    if (!hasLeaveStatus && missedCheckInDeadline) {
        await setDoc(todayRef, {
            date: todayStr,
            status: 'Quên chấm công',
            checkIn: todayData?.checkIn || 'Chưa chấm',
            checkOut: todayData?.checkOut || 'Chưa chấm',
            updatedAt: serverTimestamp()
        }, { merge: true });
    }
}

function roundCheckOutTime(totalMinutes) {
    const roundedMinutes = totalMinutes % 60 < 15
        ? totalMinutes - (totalMinutes % 60)
        : totalMinutes % 60 < 45
            ? totalMinutes - (totalMinutes % 60) + 30
            : totalMinutes - (totalMinutes % 60) + 60;
    const hour = Math.floor(roundedMinutes / 60) % 24;
    const minute = roundedMinutes % 60;
    return {
        minutes: roundedMinutes,
        text: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
    };
}

function getEarlyLeaveText(diffMinutes) {
    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;
    if (!hours) return `${minutes} phút`;
    if (!minutes) return `${hours} giờ`;
    return `${hours} giờ ${minutes} phút`;
}

function normalizeEarlyLeaveRecord(record) {
    if (!record || typeof record.status !== 'string' || !record.status.startsWith('Về sớm')) {
        return { record, changed: false };
    }

    const checkOutMinutes = parseTime(record.checkOut);
    if (checkOutMinutes === null) return { record, changed: false };

    const roundedCheckOut = roundCheckOutTime(checkOutMinutes);
    const standardOutMinutes = 18 * 60 + 30;
    const normalizedStatus = roundedCheckOut.minutes < standardOutMinutes
        ? `Về sớm ${getEarlyLeaveText(standardOutMinutes - roundedCheckOut.minutes)}`
        : 'Đi làm';
    const normalizedRecord = {
        ...record,
        checkOut: roundedCheckOut.text,
        status: normalizedStatus
    };
    const changed = normalizedRecord.checkOut !== record.checkOut
        || normalizedRecord.status !== record.status;
    return { record: normalizedRecord, changed };
}

function getFilteredData() {
    const month = document.getElementById('reportMonth').value;
    const status = document.getElementById('reportStatus').value;
    return globalAttendanceData.filter(item => {
        if (!item || typeof item.date !== 'string') return false;
        const itemStatus = getEffectiveStatus(item);
        const matchesMonth = !month || item.date.startsWith(month);
        const matchesStatus = !status
            || (status === 'Nghỉ' && itemStatus.includes('Nghỉ'))
            || (status === 'Thiếu giờ' && !itemStatus.includes('Nghỉ') && hasMissingTime(item))
            || (status === 'Về sớm' && itemStatus.startsWith('Về sớm'))
            || itemStatus === status;
        return matchesMonth && matchesStatus;
    });
}

function renderAttendanceList() {
    const listDiv = document.getElementById('attendanceList');
    const filteredData = getFilteredData();
    updateMonthStats();
    if (filteredData.length === 0) {
        listDiv.innerHTML = `
            <div class="empty-state">
                <strong>Không có dữ liệu phù hợp</strong>
                <span>Thử đổi tháng hoặc bộ lọc trạng thái.</span>
            </div>`;
        return;
    }
    const recentData = filteredData.slice(0, 8);
    listDiv.innerHTML = recentData.map(data => {
        const safeStatus = getEffectiveStatus(data);
        const isLeave = safeStatus.includes('Nghỉ');
        const isLate = safeStatus === 'Đi trễ';
        const isEarly = safeStatus.startsWith('Về sớm');
        const isForgotten = safeStatus === 'Quên chấm công';
        const statusClass = isLeave ? 'status-nghi' : isForgotten ? 'status-quen' : isLate ? 'status-trễ' : isEarly ? 'status-som' : 'status-lam';
        const holidayMark = getHolidayInfo(data.date) ? ' 🎉' : '';
        const timeHtml = isLeave
            ? `<span>Trạng thái: <strong class="time-badge">${escapeHtml(safeStatus)}</strong></span>`
            : `<span>Vào: <strong class="time-badge">${escapeHtml(data.checkIn || 'Chưa chấm')}</strong></span><span>Ra: <strong class="time-badge">${escapeHtml(data.checkOut || 'Chưa chấm')}</strong></span>`;
        return `
            <div class="item">
                <div>
                    <div class="item-date">${escapeHtml(formatDisplayDate(data.date))}${holidayMark}</div>
                    <div class="item-time">${timeHtml}</div>
                </div>
                <span class="item-status ${statusClass}">${escapeHtml(safeStatus)}</span>
            </div>`;
    }).join('');
}

document.getElementById('reportMonth').addEventListener('change', () => {
    renderAttendanceList();
    updateMonthStats();
});
document.getElementById('reportStatus').addEventListener('change', renderAttendanceList);

window.printOldMonthReport = function () {
    if (getFilteredData().length === 0) {
        Swal.fire('Trống', 'Chưa có dữ liệu để tổng hợp báo cáo tháng này.', 'info');
        return;
    }
    preparePrintData();
    window.print();
};

document.getElementById('printOldMonthBtn').addEventListener('click', printOldMonthReport);

window.updateButtonState = function () {
    const statusVal = document.getElementById('status').value;
    const btn = document.getElementById('saveBtn');
    const btnText = document.getElementById('btnText');

    updateTodayStatusCard();

    if (todayHoliday) {
        btn.disabled = true;
        btn.classList.remove('is-leave');
        btnText.textContent = `Nghỉ lễ: ${todayHoliday.name}`;
        return;
    }

    // Kiểm tra xem hôm nay đã hoàn tất thao tác chưa để khóa nút
    if (todayExistingRecord) {
        const existingStatus = typeof todayExistingRecord.status === 'string' ? todayExistingRecord.status : '';
        if (existingStatus.includes('Nghỉ')) {
            btn.disabled = true;
            btn.classList.remove('is-leave');
            btnText.textContent = 'Hôm nay đã ghi nhận nghỉ (1/1)';
            return;
        } else if (existingStatus === 'Quên chấm công' &&
            (!todayExistingRecord.checkIn || todayExistingRecord.checkIn === 'Chưa chấm')) {
            btn.disabled = true;
            btn.classList.remove('is-leave');
            btnText.textContent = 'Hôm nay đã ghi nhận quên chấm công';
            return;
        } else if (todayExistingRecord.checkIn && todayExistingRecord.checkIn !== 'Chưa chấm' &&
            todayExistingRecord.checkOut && todayExistingRecord.checkOut !== 'Chưa chấm') {
            btn.disabled = true;
            btn.classList.remove('is-leave');
            btnText.textContent = 'Đã hoàn tất chấm công hôm nay (Vào/Ra)';
            return;
        }
    }

    btn.disabled = false;
    if (statusVal.includes('Nghỉ')) {
        btn.classList.add('is-leave');
        btnText.textContent = 'Ghi nhận ngày nghỉ (1 lần)';
    } else {
        btn.classList.remove('is-leave');
        if (!todayExistingRecord || !todayExistingRecord.checkIn || todayExistingRecord.checkIn === 'Chưa chấm') {
            btnText.textContent = 'Chấm công vào (Lần 1)';
        } else {
            btnText.textContent = 'Chấm công ra (Lần 2)';
        }
    }
};

window.saveProfile = async function () {
    const input = document.getElementById('displayNameInput');
    const button = document.getElementById('saveProfileBtn');
    const displayName = input.value.trim();
    if (!displayName) {
        input.focus();
        Swal.fire('Thiếu tên', 'Vui lòng nhập tên hiển thị.', 'warning');
        return;
    }

    button.disabled = true;
    button.textContent = 'Đang lưu...';
    try {
        await setDoc(doc(db, 'users', currentUser.uid), { displayName }, { merge: true });
        document.getElementById('userDisplayName').textContent = `Xin chào, ${displayName}`;
        updateUserAvatar(displayName);
        Swal.fire({ icon: 'success', title: 'Đã lưu tên hiển thị', timer: 1400, showConfirmButton: false });
    } catch (error) {
        console.error(error);
        Swal.fire('Lỗi', 'Không thể lưu tên hiển thị.', 'error');
    } finally {
        button.disabled = false;
        button.textContent = 'Lưu tên hiển thị';
    }
};

function renderEmployees() {
    const list = document.getElementById('employeeList');
    const keyword = document.getElementById('employeeSearch').value.trim().toLowerCase();
    const month = document.getElementById('adminMonth').value;
    const statusFilter = document.getElementById('adminStatusFilter').value;
    const visibleEmployees = employees.filter(employee => {
        const text = `${employee.displayName || ''} ${employee.email || ''}`.toLowerCase();
        if (!text.includes(keyword)) return false;
        if (!statusFilter) return true;
        return (employeeAttendance.get(employee.uid) || [])
            .filter(record => !month || String(record.date || '').startsWith(month))
            .some(record => {
                const status = getEffectiveStatus(record);
                return statusFilter === 'Nghỉ'
                    ? status.includes('Nghỉ')
                    : statusFilter === 'Thiếu giờ'
                        ? !status.includes('Nghỉ') && hasMissingTime(record)
                        : status === statusFilter || status.startsWith(statusFilter);
            });
    });

    if (!visibleEmployees.length) {
        list.innerHTML = `
            <div class="empty-state">
                <strong>Không tìm thấy nhân viên</strong>
                <span>Thử đổi từ khóa tìm kiếm hoặc bộ lọc.</span>
            </div>`;
        return;
    }

    list.innerHTML = visibleEmployees.map(employee => `
                <div class="employee-row">
                    <div class="employee-info">
                        <strong>${escapeHtml(employee.displayName || 'Chưa đặt tên')}</strong>
                        <span>${escapeHtml(employee.email || employee.uid)}</span>
                        <span>${employee.active === false ? 'Trạng thái: Đã khóa' : 'Trạng thái: Đang hoạt động'} · ${escapeHtml(employee.role || 'Nhân viên')}</span>
                    </div>
                    <div class="employee-actions">
                        <button type="button" class="btn-secondary" data-view-attendance="${escapeHtml(employee.uid)}">Xem công</button>
                        <button type="button" class="btn-secondary" data-view-payroll="${escapeHtml(employee.uid)}">Tính lương</button>
                        <button type="button" class="btn-secondary" data-edit-employee="${escapeHtml(employee.uid)}">Sửa</button>
                        <button type="button" class="${employee.active === false ? 'btn-secondary' : 'btn-danger'}" data-toggle-employee="${escapeHtml(employee.uid)}">${employee.active === false ? 'Mở khóa' : 'Khóa'}</button>
                    </div>
                </div>
            `).join('');

    list.querySelectorAll('[data-edit-employee]').forEach(button => {
        button.addEventListener('click', () => editEmployee(button.dataset.editEmployee));
    });
    list.querySelectorAll('[data-view-attendance]').forEach(button => {
        button.addEventListener('click', () => viewEmployeeAttendance(button.dataset.viewAttendance));
    });
    list.querySelectorAll('[data-view-payroll]').forEach(button => {
        button.addEventListener('click', () => openPayrollModal(button.dataset.viewPayroll));
    });
    list.querySelectorAll('[data-toggle-employee]').forEach(button => {
        button.addEventListener('click', () => toggleEmployee(button.dataset.toggleEmployee));
    });
}

async function loadEmployees() {
    const list = document.getElementById('employeeList');
    showPageLoader('Đang tải danh sách nhân viên...');
    list.setAttribute('aria-busy', 'true');
    list.innerHTML = createEmployeeSkeleton();
    try {
        const snapshot = await getDocs(collection(db, 'users'));
        employees = snapshot.docs.map(employeeDoc => ({ uid: employeeDoc.id, ...employeeDoc.data() }))
            .filter(employee => employee.uid !== currentUser.uid)
            .sort((first, second) => String(first.displayName || first.email || '').localeCompare(String(second.displayName || second.email || ''), 'vi'));
        employeeAttendance = new Map();
        await Promise.all(employees.map(async employee => {
            const attendanceSnapshot = await getDocs(collection(db, 'users', employee.uid, 'attendance'));
            employeeAttendance.set(employee.uid, attendanceSnapshot.docs.map(record => record.data()));
        }));
        updateAdminSummary();
        renderEmployees();
    } catch (error) {
        console.error(error);
        list.innerHTML = '<p style="color:var(--danger);">Không thể tải danh sách nhân viên. Hãy kiểm tra Firestore Rules.</p>';
    } finally {
        list.removeAttribute('aria-busy');
        hidePageLoader();
    }
}

function updateAdminSummary() {
    const todayRecords = employees.map(employee => (employeeAttendance.get(employee.uid) || [])
        .find(record => record.date === todayStr));
    const month = document.getElementById('adminMonth').value;
    const monthRecords = employees.flatMap(employee => employeeAttendance.get(employee.uid) || [])
        .filter(record => !month || String(record.date || '').startsWith(month));
    const effectiveStatuses = monthRecords.map(getEffectiveStatus);
    document.getElementById('totalEmployees').textContent = employees.length;
    document.getElementById('activeEmployees').textContent = employees.filter(employee => employee.active !== false).length;
    document.getElementById('checkedEmployees').textContent = todayRecords.filter(Boolean).length;
    document.getElementById('lateEmployees').textContent = effectiveStatuses.filter(status => status === 'Đi trễ').length;
    document.getElementById('missingEmployees').textContent = monthRecords.filter(record => hasMissingTime(record) && !getEffectiveStatus(record).includes('Nghỉ')).length;
    document.getElementById('leaveEmployees').textContent = effectiveStatuses.filter(status => status.includes('Nghỉ')).length;
    renderAdminDashboard(monthRecords, todayRecords);
}

function renderAdminDashboard(monthRecords, todayRecords) {
    const month = document.getElementById('adminMonth').value;
    const periodLabel = document.getElementById('adminDashboardPeriod');
    const chart = document.getElementById('attendanceChart');
    const legend = document.getElementById('statusLegend');
    const donut = document.getElementById('statusDonut');
    if (!chart || !legend || !donut) return;

    const monthStart = month ? new Date(`${month}-01T00:00:00`) : new Date();
    const monthDays = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
    const dayCounts = Array.from({ length: monthDays }, () => 0);
    monthRecords.forEach(record => {
        const day = Number(String(record.date || '').slice(8, 10));
        if (day >= 1 && day <= monthDays) dayCounts[day - 1] += 1;
    });
    const maxCount = Math.max(...dayCounts, 1);
    chart.innerHTML = dayCounts.map((count, index) => {
        const height = count ? Math.max(10, Math.round((count / maxCount) * 100)) : 4;
        return `<span class="chart-bar${count === 0 ? ' is-empty' : ''}" style="height:${height}%" title="Ngày ${index + 1}: ${count} lượt chấm"><i></i></span>`;
    }).join('');
    const expected = Math.max(employees.length * monthDays, 1);
    const attendanceRate = Math.min(100, Math.round((monthRecords.length / expected) * 100));
    document.getElementById('attendanceRateLabel').textContent = `${attendanceRate}%`;
    periodLabel.textContent = new Intl.DateTimeFormat('vi-VN', { month: 'long', year: 'numeric' }).format(monthStart);

    const statusGroups = [
        { label: 'Đi làm', color: '#2cad73', value: monthRecords.filter(record => ['Đi làm', 'Về sớm'].includes(getEffectiveStatus(record))).length },
        { label: 'Đi trễ', color: '#e5aa32', value: monthRecords.filter(record => getEffectiveStatus(record) === 'Đi trễ').length },
        { label: 'Nghỉ', color: '#d96560', value: monthRecords.filter(record => getEffectiveStatus(record).includes('Nghỉ')).length },
        { label: 'Thiếu công', color: '#5ba3f5', value: monthRecords.filter(record => !getEffectiveStatus(record).includes('Nghỉ') && hasMissingTime(record)).length }
    ];
    const totalStatuses = statusGroups.reduce((sum, item) => sum + item.value, 0);
    let cursor = 0;
    const segments = statusGroups.map(item => {
        const start = cursor;
        cursor += totalStatuses ? (item.value / totalStatuses) * 360 : 0;
        return `${item.color} ${start}deg ${cursor}deg`;
    });
    donut.style.background = totalStatuses ? `conic-gradient(${segments.join(', ')})` : 'conic-gradient(#d9e2ec 0deg 360deg)';
    document.getElementById('statusDonutTotal').textContent = totalStatuses;
    legend.innerHTML = statusGroups.map(item => `<div class="legend-row"><span><i style="background:${item.color}"></i>${item.label}</span><strong>${item.value}</strong></div>`).join('');

    const checkedToday = todayRecords.filter(Boolean).length;
    document.getElementById('todayCoverageLabel').textContent = `${checkedToday}/${employees.length} đã chấm`;
    const attention = employees.map((employee, index) => {
        const record = todayRecords[index];
        const status = record ? getEffectiveStatus(record) : 'Chưa chấm';
        return { employee, status, record };
    }).filter(item => !item.record || item.status === 'Đi trễ' || item.status === 'Quên chấm công' || hasMissingTime(item.record));
    document.getElementById('todayAttentionList').innerHTML = attention.length
        ? attention.slice(0, 5).map(item => `<div class="attention-row"><span class="mini-avatar">${escapeHtml(getInitials(item.employee.displayName || item.employee.email))}</span><div><strong>${escapeHtml(item.employee.displayName || item.employee.email || 'Chưa đặt tên')}</strong><small>${escapeHtml(item.status)}</small></div><span class="attention-dot ${item.record ? 'is-warning' : 'is-missing'}"></span></div>`).join('')
        : '<div class="dashboard-empty">Mọi người đã cập nhật đầy đủ hôm nay.</div>';

    const leaderboard = employees.map(employee => {
        const records = (employeeAttendance.get(employee.uid) || []).filter(record => !month || String(record.date || '').startsWith(month));
        const workDays = records.filter(record => !getEffectiveStatus(record).includes('Nghỉ')).length;
        const completeDays = records.filter(record => !getEffectiveStatus(record).includes('Nghỉ') && !hasMissingTime(record)).length;
        return { employee, workDays, completeDays };
    }).sort((first, second) => second.completeDays - first.completeDays || second.workDays - first.workDays).slice(0, 5);
    document.getElementById('employeeLeaderboard').innerHTML = leaderboard.length
        ? leaderboard.map((item, index) => `<div class="leaderboard-row"><span class="rank">${index + 1}</span><span class="mini-avatar is-blue">${escapeHtml(getInitials(item.employee.displayName || item.employee.email))}</span><div class="leaderboard-name"><strong>${escapeHtml(item.employee.displayName || item.employee.email || 'Chưa đặt tên')}</strong><small>${item.completeDays} ngày đủ công · ${item.workDays} ngày làm</small></div><b>${item.completeDays}</b></div>`).join('')
        : '<div class="dashboard-empty">Chưa có dữ liệu nhân viên.</div>';
}

async function viewEmployeeAttendance(uid) {
    const employee = employees.find(item => item.uid === uid);
    if (!employee) return;
    const month = document.getElementById('adminMonth').value;
    const records = (employeeAttendance.get(uid) || [])
        .filter(record => !month || String(record.date || '').startsWith(month))
        .sort((first, second) => String(second.date).localeCompare(String(first.date)));
    const rows = records.length ? records.map(record => `
                <tr>
                    <td style="padding:10px 8px;border-bottom:1px solid #e2e8f0;white-space:nowrap;">${escapeHtml(record.date)}</td>
                    <td style="padding:10px 8px;border-bottom:1px solid #e2e8f0;">${escapeHtml(record.status || '')}</td>
                    <td style="padding:10px 8px;border-bottom:1px solid #e2e8f0;white-space:nowrap;">${escapeHtml(record.checkIn || 'Chưa chấm')}</td>
                    <td style="padding:10px 8px;border-bottom:1px solid #e2e8f0;white-space:nowrap;">${escapeHtml(record.checkOut || 'Chưa chấm')}</td>
                    <td style="padding:7px 4px;border-bottom:1px solid #e2e8f0;text-align:right;"><button type="button" class="btn-secondary admin-edit-attendance" data-date="${escapeHtml(record.date)}" style="width:auto;padding:7px 10px;font-size:12px;margin:0;">Sửa</button></td>
                </tr>
            `).join('') : '<tr><td colspan="5">Không có dữ liệu trong tháng này.</td></tr>';
    await Swal.fire({
        title: escapeHtml(employee.displayName || employee.email || 'Nhân viên'),
        html: `<div style="max-height:360px;overflow:auto;padding:0 4px;"><table class="attendance-view-table" style="width:100%;border-collapse:separate;border-spacing:0 3px;text-align:left;font-size:13px;"><thead><tr><th style="padding:4px 8px 7px;">Ngày</th><th style="padding:4px 8px 7px;">Trạng thái</th><th style="padding:4px 8px 7px;">Vào</th><th style="padding:4px 8px 7px;">Ra</th><th style="padding:4px 4px 7px;"></th></tr></thead><tbody>${rows}</tbody></table></div>`,
        confirmButtonText: 'Đóng',
        width: 720,
        customClass: { popup: 'attendance-view-popup' },
        didOpen: () => {
            document.querySelectorAll('.admin-edit-attendance').forEach(button => {
                button.addEventListener('click', () => editEmployeeAttendance(uid, button.dataset.date));
            });
        }
    });
}

async function editEmployeeAttendance(uid, date) {
    const record = (employeeAttendance.get(uid) || []).find(item => item.date === date);
    if (!record) return;
    const currentStatus = String(record.status || 'Đi làm');
    const isLeaveRecord = currentStatus.includes('Nghỉ');
    const result = await Swal.fire({
        title: `Sửa công ngày ${date}`,
        html: `
            <div id="adminTimeFields" style="display:${isLeaveRecord ? 'none' : 'block'}">
                <input id="adminCheckIn" class="swal2-input" style="width:100%;max-width:100%;margin:8px 0;" value="${escapeHtml(record.checkIn || 'Chưa chấm')}" placeholder="Giờ vào, ví dụ 08:00">
                <input id="adminCheckOut" class="swal2-input" style="width:100%;max-width:100%;margin:8px 0;" value="${escapeHtml(record.checkOut || 'Chưa chấm')}" placeholder="Giờ ra, ví dụ 17:30">
            </div>
            <select id="adminRecordStatus" class="swal2-select" style="display:block;width:100%;max-width:100%;margin:8px 0;box-sizing:border-box;">
                ${['Đi làm', 'Đi trễ', 'Về sớm', 'Nghỉ phép', 'Nghỉ không lương', 'Nghỉ Lễ', 'Quên chấm công'].map(status => `<option value="${status}" ${String(record.status || '') === status ? 'selected' : ''}>${status}</option>`).join('')}
            </select>`,
        showCancelButton: true,
        confirmButtonText: 'Lưu thay đổi',
        cancelButtonText: 'Hủy',
        width: 520,
        customClass: { popup: 'attendance-edit-popup' },
        didOpen: () => {
            document.getElementById('adminRecordStatus').addEventListener('change', event => {
                document.getElementById('adminTimeFields').style.display = event.target.value.includes('Nghỉ') ? 'none' : 'block';
            });
        },
        preConfirm: () => {
            const status = document.getElementById('adminRecordStatus').value;
            const isLeave = status.includes('Nghỉ');
            const checkIn = document.getElementById('adminCheckIn').value.trim();
            const checkOut = document.getElementById('adminCheckOut').value.trim();
            if (!isLeave && ((checkIn && checkIn !== 'Chưa chấm' && parseTime(checkIn) === null)
                || (checkOut && checkOut !== 'Chưa chấm' && parseTime(checkOut) === null))) {
                Swal.showValidationMessage('Giờ vào/ra phải có định dạng HH:mm, ví dụ 08:00 hoặc 22:30.');
                return undefined;
            }
            return {
                checkIn: isLeave ? 'Nghỉ' : (checkIn || 'Chưa chấm'),
                checkOut: isLeave ? 'Nghỉ' : (checkOut || 'Chưa chấm'),
                status
            };
        }
    });
    if (!result.isConfirmed) return;

    try {
        const attendanceRef = doc(db, 'users', uid, 'attendance', date);
        await setDoc(attendanceRef, { ...result.value, updatedAt: serverTimestamp(), updatedBy: currentUser.uid }, { merge: true });
        await setDoc(doc(db, 'auditLogs', `${Date.now()}-${uid}`), {
            action: 'UPDATE_ATTENDANCE', employeeUid: uid, date,
            before: { checkIn: record.checkIn || 'Chưa chấm', checkOut: record.checkOut || 'Chưa chấm', status: record.status || '' },
            after: result.value, updatedBy: currentUser.uid, updatedAt: serverTimestamp()
        });
        await loadEmployees();
        Swal.fire({ icon: 'success', title: 'Đã cập nhật công', timer: 1300, showConfirmButton: false });
    } catch (error) {
        console.error(error);
        Swal.fire('Lỗi', 'Không thể cập nhật công. Hãy kiểm tra Firestore Rules.', 'error');
    }
}

async function editEmployee(uid) {
    const employee = employees.find(item => item.uid === uid);
    if (!employee) return;
    const payroll = employee.payroll || {};
    const result = await Swal.fire({
        title: 'Sửa nhân viên',
        html: `
            <input id="employeeDisplayName" class="swal2-input" value="${escapeHtml(employee.displayName || '')}" placeholder="Tên hiển thị">
            <input id="employeeDepartment" class="swal2-input" value="${escapeHtml(employee.department || '')}" placeholder="Phòng ban / Bộ phận">
            <select id="employeeRole" class="swal2-select">
                ${['Nhân viên', 'Quản trị viên', 'Super Admin'].map(role => `<option value="${role}" ${String(employee.role || 'Nhân viên') === role ? 'selected' : ''}>${role}</option>`).join('')}
            </select>
            <div class="admin-payroll-form">
                <strong>Thiết lập tính lương</strong>
                <div class="admin-payroll-grid">
                    <input id="employeeTotalSalary" class="swal2-input" inputmode="numeric" value="${formatNumberInput(payroll.totalSalary || employee.totalSalary || 8200000)}" placeholder="Tổng lương">
                    <input id="employeeInsuranceSalary" class="swal2-input" inputmode="numeric" value="${formatNumberInput(payroll.insuranceSalary || employee.insuranceSalary || 5681800)}" placeholder="Lương BHXH">
                    <input id="employeeAllowance" class="swal2-input" inputmode="numeric" value="${formatNumberInput(payroll.allowance || 0)}" placeholder="Phụ cấp mặc định">
                    <input id="employeeWorkDays" class="swal2-input" type="number" min="1" max="31" step="0.1" value="${Number(payroll.workDaysPerMonth || 26)}" placeholder="Ngày công chuẩn / tháng">
                    <input id="employeeWorkHours" class="swal2-input" type="number" min="1" max="24" step="0.5" value="${Number(payroll.workHoursPerDay || 8)}" placeholder="Giờ chuẩn / ngày">
                    <input id="employeeBreakMinutes" class="swal2-input" type="number" min="0" max="240" step="15" value="${Number(payroll.breakMinutes || 60)}" placeholder="Nghỉ giữa ca (phút)">
                </div>
                <small>BHXH tự động tính 10,5% trên lương BHXH. Admin vẫn có thể điều chỉnh các khoản khấu trừ trong phiếu lương.</small>
            </div>`,
        showCancelButton: true,
        confirmButtonText: 'Lưu',
        cancelButtonText: 'Hủy',
        didOpen: () => bindNumberFormatting(['employeeTotalSalary', 'employeeInsuranceSalary', 'employeeAllowance']),
        preConfirm: () => {
            const displayName = document.getElementById('employeeDisplayName').value.trim();
            if (!displayName) {
                Swal.showValidationMessage('Vui lòng nhập tên nhân viên.');
                return undefined;
            }
            const totalSalary = parseNumberInput(document.getElementById('employeeTotalSalary').value);
            const insuranceSalary = parseNumberInput(document.getElementById('employeeInsuranceSalary').value);
            const workDaysPerMonth = Number(document.getElementById('employeeWorkDays').value || 26);
            const workHoursPerDay = Number(document.getElementById('employeeWorkHours').value || 8);
            const breakMinutes = Number(document.getElementById('employeeBreakMinutes').value || 60);
            if (totalSalary < 0 || insuranceSalary < 0 || workDaysPerMonth <= 0 || workHoursPerDay <= 0 || breakMinutes < 0) {
                Swal.showValidationMessage('Thông số lương phải là số hợp lệ và không âm.');
                return undefined;
            }
            return {
                displayName,
                department: document.getElementById('employeeDepartment').value.trim(),
                role: document.getElementById('employeeRole').value,
                payroll: {
                    totalSalary,
                    insuranceSalary,
                    allowance: parseNumberInput(document.getElementById('employeeAllowance').value),
                    workDaysPerMonth,
                    workHoursPerDay,
                    breakMinutes
                }
            };
        }
    });
    if (!result.isConfirmed) return;
    try {
        await setDoc(doc(db, 'users', uid), { ...result.value, updatedAt: serverTimestamp(), updatedBy: currentUser.uid }, { merge: true });
        await setDoc(doc(db, 'auditLogs', `${Date.now()}-${uid}`), {
            action: 'UPDATE_EMPLOYEE_PROFILE', employeeUid: uid,
            before: { displayName: employee.displayName || '', role: employee.role || 'Nhân viên', department: employee.department || '', payroll: employee.payroll || {} },
            after: result.value, updatedBy: currentUser.uid, updatedAt: serverTimestamp()
        });
        await loadEmployees();
        Swal.fire({ icon: 'success', title: 'Đã cập nhật', timer: 1200, showConfirmButton: false });
    } catch (error) {
        console.error(error);
        Swal.fire('Lỗi', 'Không thể cập nhật nhân viên.', 'error');
    }
}

async function toggleEmployee(uid) {
    const employee = employees.find(item => item.uid === uid);
    if (!employee) return;
    const willActivate = employee.active === false;
    const result = await Swal.fire({
        title: willActivate ? 'Mở khóa nhân viên?' : 'Khóa nhân viên?',
        text: willActivate ? 'Nhân viên sẽ được đánh dấu đang hoạt động.' : 'Nhân viên sẽ không được phép chấm công nếu Rules kiểm tra trạng thái này.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: willActivate ? 'Mở khóa' : 'Khóa',
        cancelButtonText: 'Hủy'
    });
    if (!result.isConfirmed) return;
    try {
        await setDoc(doc(db, 'users', uid), { active: willActivate }, { merge: true });
        await loadEmployees();
    } catch (error) {
        console.error(error);
        Swal.fire('Lỗi', 'Không thể cập nhật trạng thái nhân viên.', 'error');
    }
}

function formatCurrency(value) {
    return `${Math.round(Number(value) || 0).toLocaleString('vi-VN')} đ`;
}

function formatNumberInput(value) {
    const number = Number(String(value ?? '').replace(/\./g, '').replace(/,/g, ''));
    return Number.isFinite(number) ? number.toLocaleString('vi-VN') : '';
}

function parseNumberInput(value) {
    const normalized = String(value ?? '').replace(/\./g, '').replace(/,/g, '').replace(/\s/g, '');
    const number = Number(normalized);
    return Number.isFinite(number) ? number : 0;
}

function getEmployeePayrollConfig(employee) {
    const config = employee?.payroll || {};
    return {
        totalSalary: Number(config.totalSalary || employee?.totalSalary || 8200000),
        insuranceSalary: Number(config.insuranceSalary || employee?.insuranceSalary || 5681800),
        allowance: Number(config.allowance || 0),
        workDaysPerMonth: Number(config.workDaysPerMonth || 30),
        workHoursPerDay: Number(config.workHoursPerDay || 8),
        breakMinutes: Number(config.breakMinutes ?? 60)
    };
}

function calculatePayroll(employee, month, adjustments = {}) {
    const config = getEmployeePayrollConfig(employee);
    const records = (employeeAttendance.get(employee.uid) || [])
        .filter(record => !month || String(record.date || '').startsWith(month));
    const standardMinutes = config.workHoursPerDay * 60;
    let workDayEquivalent = 0;
    let requestedPaidLeaveDays = 0;
    let unpaidLeaveDays = 0;
    let totalWorkMinutes = 0;
    let overtimeMinutes = 0;
    let lateDays = 0;
    let forgottenDays = 0;
    let missingDays = 0;

    records.forEach(record => {
        const status = getEffectiveStatus(record);
        if (status.includes('Nghỉ')) {
            if (status.includes('Nghỉ phép')) requestedPaidLeaveDays += 1;
            else unpaidLeaveDays += 1;
            return;
        }
        if (status === 'Đi trễ') lateDays += 1;
        if (status === 'Quên chấm công') forgottenDays += 1;
        const checkIn = parseTime(record.checkIn);
        const checkOut = parseTime(record.checkOut);
        if (checkIn === null || checkOut === null) {
            missingDays += 1;
            return;
        }
        const elapsedMinutes = checkOut < checkIn ? checkOut + (24 * 60) - checkIn : checkOut - checkIn;
        const netMinutes = Math.max(0, elapsedMinutes - config.breakMinutes);
        totalWorkMinutes += netMinutes;
        workDayEquivalent += Math.min(netMinutes, standardMinutes) / standardMinutes;
        overtimeMinutes += Math.max(0, netMinutes - standardMinutes);
    });

    const monthDays = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
    const paidLeaveDays = Math.min(requestedPaidLeaveDays, 3);
    unpaidLeaveDays += Math.max(0, requestedPaidLeaveDays - paidLeaveDays);
    const dayRate = config.totalSalary / monthDays;
    const hourRate = dayRate / config.workHoursPerDay;
    const workPay = dayRate * workDayEquivalent;
    const leavePay = dayRate * paidLeaveDays;
    const overtimeHours = adjustments.overtimeHours === undefined
        ? overtimeMinutes / 60
        : Math.max(0, Number(adjustments.overtimeHours) || 0);
    const overtimePay = hourRate * overtimeHours * 1.5;
    const allowance = Number(adjustments.allowance ?? config.allowance);
    const bonus = Number(adjustments.bonus || 0);
    const insurance = config.insuranceSalary * 0.105;
    const advance = Number(adjustments.advance || 0);
    const tax = Number(adjustments.tax || 0);
    const lateDeduction = Number(adjustments.lateDeduction || 0);
    const forgottenDeduction = Number(adjustments.forgottenDeduction || 0);
    const otherDeduction = Number(adjustments.otherDeduction || 0);
    const grossPay = workPay + leavePay + overtimePay + allowance + bonus;
    const totalDeduction = insurance + advance + tax + lateDeduction + forgottenDeduction + otherDeduction;

    return {
        month, config, records, monthDays, requestedPaidLeaveDays, workDayEquivalent, paidLeaveDays, unpaidLeaveDays, totalWorkMinutes,
        overtimeMinutes, lateDays, forgottenDays, missingDays, dayRate, hourRate, workPay, leavePay,
        overtimeHours, overtimePay, allowance, bonus, insurance, advance, tax, lateDeduction, forgottenDeduction,
        otherDeduction, grossPay, totalDeduction, netPay: grossPay - totalDeduction
    };
}

function payrollInputValue(id) {
    return parseNumberInput(document.getElementById(id)?.value || 0);
}

function bindNumberFormatting(ids) {
    ids.forEach(id => {
        const input = document.getElementById(id);
        if (!input) return;
        input.value = formatNumberInput(input.value);
        input.addEventListener('input', () => {
            input.value = formatNumberInput(input.value.replace(/[^0-9]/g, ''));
        });
    });
}

function renderPayrollPreview(employee, month) {
    const adjustments = {
        allowance: payrollInputValue('payrollAllowance'),
        bonus: payrollInputValue('payrollBonus'),
        overtimeHours: Number(document.getElementById('payrollOvertimeHoursInput')?.value || 0),
        advance: payrollInputValue('payrollAdvance'),
        tax: payrollInputValue('payrollTax'),
        lateDeduction: payrollInputValue('payrollLateDeduction'),
        forgottenDeduction: payrollInputValue('payrollForgottenDeduction'),
        otherDeduction: payrollInputValue('payrollOtherDeduction')
    };
    const summary = calculatePayroll(employee, month, adjustments);
    const valueMap = {
        payrollWorkDays: summary.workDayEquivalent.toFixed(2),
        payrollOvertimeHours: summary.overtimeHours.toFixed(2),
        payrollLeaveDays: summary.paidLeaveDays.toFixed(2),
        payrollUnpaidLeaveDays: summary.unpaidLeaveDays.toFixed(2),
        payrollWorkPay: formatCurrency(summary.workPay),
        payrollLeavePay: formatCurrency(summary.leavePay),
        payrollOvertimePay: formatCurrency(summary.overtimePay),
        payrollInsurance: formatCurrency(summary.insurance),
        payrollGross: formatCurrency(summary.grossPay),
        payrollDeduction: formatCurrency(summary.totalDeduction),
        payrollNet: formatCurrency(summary.netPay)
    };
    Object.entries(valueMap).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    });
    return { summary, adjustments };
}

async function openPayrollModal(uid) {
    const employee = employees.find(item => item.uid === uid);
    if (!employee) return;
    const month = document.getElementById('adminMonth').value || todayStr.slice(0, 7);
    const config = getEmployeePayrollConfig(employee);
    const savedPayrollSnapshot = await getDoc(doc(db, 'users', uid, 'payroll', month));
    const savedPayroll = savedPayrollSnapshot.exists() ? savedPayrollSnapshot.data() : {};
    const calculatedDefault = calculatePayroll(employee, month, {});
    const initial = {
        allowance: savedPayroll.allowance ?? config.allowance,
        bonus: savedPayroll.bonus || 0,
        overtimeHours: savedPayroll.overtimeHours ?? calculatedDefault.overtimeHours,
        advance: savedPayroll.advance || 0,
        tax: savedPayroll.tax || 0,
        lateDeduction: savedPayroll.lateDeduction || 0,
        forgottenDeduction: savedPayroll.forgottenDeduction || 0,
        otherDeduction: savedPayroll.otherDeduction || 0
    };
    const result = await Swal.fire({
        title: `Phiếu lương tháng ${month.slice(5)}/${month.slice(0, 4)}`,
        html: `
            <div class="payroll-modal">
                <div class="payroll-employee"><strong>${escapeHtml(employee.displayName || employee.email || 'Nhân viên')}</strong><span>${escapeHtml(employee.department || 'Chưa cập nhật phòng ban')} · ${escapeHtml(employee.email || '')}</span></div>
                <div class="payroll-metrics"><div><small>Ngày công</small><strong id="payrollWorkDays">0</strong></div><div><small>Giờ tăng ca admin xác nhận</small><strong id="payrollOvertimeHours">0</strong></div><div><small>Phép có lương</small><strong id="payrollLeaveDays">0</strong></div></div>
                <div class="payroll-columns">
                    <div><h4>Các khoản được hưởng</h4><label>Giờ tăng ca admin xác nhận <input id="payrollOvertimeHoursInput" type="number" min="0" step="0.25" value="${initial.overtimeHours}"></label><p>Lương ngày công <b id="payrollWorkPay">0 đ</b></p><p>Lương nghỉ phép <b id="payrollLeavePay">0 đ</b></p><p>Lương tăng ca (150%) <b id="payrollOvertimePay">0 đ</b></p><label>Phụ cấp <input id="payrollAllowance" inputmode="numeric" value="${formatNumberInput(initial.allowance)}"></label><label>Thưởng <input id="payrollBonus" inputmode="numeric" value="${formatNumberInput(initial.bonus)}"></label></div>
                    <div><h4>Các khoản phải thu</h4><p>Nộp BHXH (10,5%) <b id="payrollInsurance">0 đ</b></p><label>Ứng lương <input id="payrollAdvance" inputmode="numeric" value="${formatNumberInput(Math.min(initial.advance, 4000000))}"></label><small>Giới hạn tối đa: 4.000.000 đ</small><label>Thuế TNCN <input id="payrollTax" inputmode="numeric" value="${formatNumberInput(initial.tax)}"></label><label>Khấu trừ đi trễ <input id="payrollLateDeduction" inputmode="numeric" value="${formatNumberInput(initial.lateDeduction)}"></label><label>Khấu trừ quên công <input id="payrollForgottenDeduction" inputmode="numeric" value="${formatNumberInput(initial.forgottenDeduction)}"></label><label>Khấu trừ khác <input id="payrollOtherDeduction" inputmode="numeric" value="${formatNumberInput(initial.otherDeduction)}"></label></div>
                </div>
                <div class="payroll-total"><span>Tổng thu nhập <b id="payrollGross">0 đ</b></span><span>Tổng khấu trừ <b id="payrollDeduction">0 đ</b></span><strong>Thực nhận <em id="payrollNet">0 đ</em></strong></div>
                <small class="payroll-note">Tăng ca được tính 150% theo giờ chuẩn. Thời gian giữa giờ vào và giờ ra đã trừ phút nghỉ giữa ca theo cấu hình nhân viên.</small>
            </div>`,
        showCancelButton: true,
        confirmButtonText: 'Lưu & in phiếu lương',
        cancelButtonText: 'Đóng',
        width: 760,
        customClass: { popup: 'payroll-popup' },
        didOpen: () => {
            bindNumberFormatting(['payrollAllowance', 'payrollBonus', 'payrollAdvance', 'payrollTax', 'payrollLateDeduction', 'payrollForgottenDeduction', 'payrollOtherDeduction']);
            ['payrollAllowance', 'payrollBonus', 'payrollAdvance', 'payrollTax', 'payrollLateDeduction', 'payrollForgottenDeduction', 'payrollOtherDeduction', 'payrollOvertimeHoursInput'].forEach(id => {
                document.getElementById(id).addEventListener('input', () => renderPayrollPreview(employee, month));
            });
            renderPayrollPreview(employee, month);
        },
        preConfirm: () => {
            if (payrollInputValue('payrollAdvance') > 4000000) {
                Swal.showValidationMessage('Ứng lương tối đa là 4.000.000 đ.');
                return undefined;
            }
            return renderPayrollPreview(employee, month);
        }
    });
    if (!result.isConfirmed) return;
    const { summary, adjustments } = result.value;
    try {
        await setDoc(doc(db, 'users', uid, 'payroll', month), {
            ...adjustments,
            month: summary.month,
            workDayEquivalent: summary.workDayEquivalent,
            paidLeaveDays: summary.paidLeaveDays,
            overtimeMinutes: summary.overtimeMinutes,
            overtimeHours: summary.overtimeHours,
            workPay: summary.workPay,
            leavePay: summary.leavePay,
            overtimePay: summary.overtimePay,
            insurance: summary.insurance,
            grossPay: summary.grossPay,
            totalDeduction: summary.totalDeduction,
            netPay: summary.netPay,
            employeeUid: uid,
            updatedAt: serverTimestamp(),
            updatedBy: currentUser.uid
        });
        preparePayrollPrint(employee, summary);
        window.print();
    } catch (error) {
        console.error(error);
        Swal.fire('Lỗi', 'Không thể lưu phiếu lương. Hãy kiểm tra Firestore Rules.', 'error');
    }
}

function preparePayrollPrint(employee, summary) {
    const printSection = document.getElementById('payroll-print-section');
    if (!printSection) return;
    const setText = (id, value) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    };
    setText('payroll-print-name', employee.displayName || employee.email || 'Nhân viên');
    setText('payroll-print-department', employee.department || 'Chưa cập nhật');
    setText('payroll-print-month', `Tháng ${summary.month.slice(5)} năm ${summary.month.slice(0, 4)}`);
    setText('payroll-print-total-salary', formatCurrency(summary.config.totalSalary));
    setText('payroll-print-insurance-salary', formatCurrency(summary.config.insuranceSalary));
    setText('payroll-print-work-days', summary.workDayEquivalent.toFixed(2));
    setText('payroll-print-leave-days', summary.paidLeaveDays.toFixed(2));
    setText('payroll-print-unpaid-leave-days', summary.unpaidLeaveDays.toFixed(2));
    setText('payroll-print-overtime-hours', summary.overtimeHours.toFixed(2));
    setText('payroll-print-work-pay', formatCurrency(summary.workPay));
    setText('payroll-print-leave-pay', formatCurrency(summary.leavePay));
    setText('payroll-print-overtime-pay', formatCurrency(summary.overtimePay));
    setText('payroll-print-allowance', formatCurrency(summary.allowance));
    setText('payroll-print-bonus', formatCurrency(summary.bonus));
    setText('payroll-print-gross', formatCurrency(summary.grossPay));
    setText('payroll-print-insurance', formatCurrency(summary.insurance));
    setText('payroll-print-advance', formatCurrency(summary.advance));
    setText('payroll-print-tax', formatCurrency(summary.tax));
    setText('payroll-print-late', formatCurrency(summary.lateDeduction));
    setText('payroll-print-forgotten', formatCurrency(summary.forgottenDeduction));
    setText('payroll-print-other', formatCurrency(summary.otherDeduction));
    setText('payroll-print-net', formatCurrency(summary.netPay));
}

document.getElementById('employeeSearch').addEventListener('input', renderEmployees);
document.getElementById('refreshEmployeesBtn').addEventListener('click', loadEmployees);
document.getElementById('adminMonth').value = todayStr.slice(0, 7);
document.getElementById('adminMonth').addEventListener('change', () => {
    updateAdminSummary();
    renderEmployees();
});
document.getElementById('adminStatusFilter').addEventListener('change', renderEmployees);

window.saveAttendance = async function () {
    const date = dateInput.value;
    let status = document.getElementById('status').value;

    if (!date || date !== todayStr) {
        Swal.fire({
            icon: 'warning',
            title: 'Chỉ được phép thao tác hôm nay!',
            confirmButtonColor: '#4f46e5'
        });
        return;
    }

    if (todayHoliday) {
        Swal.fire({
            icon: 'info',
            title: 'Hôm nay được nghỉ lễ',
            text: `${todayHoliday.name} theo quy định nghỉ lễ của Nhà nước.`,
            confirmButtonColor: '#4f46e5'
        });
        return;
    }

    const now = new Date();
    const vietnamParts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(now);
    const currentHour = Number(vietnamParts.find(part => part.type === 'hour').value);
    const currentMinute = Number(vietnamParts.find(part => part.type === 'minute').value);
    const currentTime = String(currentHour).padStart(2, '0') + ':' + String(currentMinute).padStart(2, '0');
    const totalCurrentMinutes = currentHour * 60 + currentMinute;

    const isLeaveStatus = status.includes('Nghỉ');

    let calculatedCheckIn = "";
    let calculatedCheckOut = "";
    let finalStatus = status;

    // Kiểm tra trạng thái nếu hôm nay đã tồn tại bản ghi
    if (todayExistingRecord) {
        const existingStatus = typeof todayExistingRecord.status === 'string' ? todayExistingRecord.status : '';
        
        // Nếu đã chấm nghỉ nhưng chuyển sang "Đi làm", cho phép đổi lại
        if (existingStatus.includes('Nghỉ') && !isLeaveStatus) {
            Swal.fire('Thông báo', 'Bạn đã chấm nghỉ hôm nay. Vui lòng xóa record rồi chấm lại.', 'warning');
            return;
        }
        if (existingStatus === 'Quên chấm công' &&
            (!todayExistingRecord.checkIn || todayExistingRecord.checkIn === 'Chưa chấm')) {
            Swal.fire('Thông báo', 'Hôm nay đã được ghi nhận là quên chấm công.', 'warning');
            return;
        }
        if (todayExistingRecord.checkIn && todayExistingRecord.checkIn !== 'Chưa chấm' &&
            todayExistingRecord.checkOut && todayExistingRecord.checkOut !== 'Chưa chấm') {
            Swal.fire('Thông báo', 'Bạn đã hoàn tất đủ công vào và công ra trong ngày hôm nay rồi.', 'warning');
            return;
        }
    }

    if (isLeaveStatus) {
        // Kiểm tra giới hạn: nút nghỉ chỉ được thao tác 1 lần và kiểm tra giờ quy định
        if (totalCurrentMinutes > 8 * 60) {
            finalStatus = "Nghỉ không lương";
        } else {
            finalStatus = status;
        }

        if (totalCurrentMinutes > 12 * 60) {
            Swal.fire({
                icon: 'warning',
                title: 'Quá giờ báo nghỉ!',
                text: 'Bạn chỉ có thể thực hiện thao tác này vào ngày mai!',
                confirmButtonColor: '#f59e0b'
            });
            return;
        }

        calculatedCheckIn = "Nghỉ";
        calculatedCheckOut = "Nghỉ";
    } else {
        // Logic đi làm chia làm 2 lần rõ rệt (Lần 1: Vào, Lần 2: Ra)
        if (!todayExistingRecord) {
            // --- LẦN 1: CHẤM CÔNG VÀO ---
            if (totalCurrentMinutes < 6 * 60) {
                Swal.fire({
                    icon: 'warning',
                    title: 'Chưa đến giờ chấm công vào!',
                    text: 'Chỉ được chấm công vào từ 06:00 sáng.',
                    confirmButtonColor: '#f59e0b'
                });
                return;
            } else if (totalCurrentMinutes <= 8 * 60) {
                calculatedCheckIn = currentTime;
                finalStatus = "Đi làm";
            } else if (totalCurrentMinutes <= 12 * 60) {
                calculatedCheckIn = currentTime;
                finalStatus = "Đi trễ";
            } else {
                Swal.fire({
                    icon: 'warning',
                    title: 'Đã quá giờ chấm công vào!',
                    text: 'Chấm công vào chỉ được thực hiện trước hoặc lúc 12:00.',
                    confirmButtonColor: '#f59e0b'
                });
                return;
            }
        } else {
            // --- LẦN 2: CHẤM CÔNG RA ---
            if (totalCurrentMinutes >= 12 * 60) {
                const roundedCheckOut = roundCheckOutTime(totalCurrentMinutes);
                const standardOutMinutes = 18 * 60 + 30;
                calculatedCheckOut = roundedCheckOut.text;
                if (roundedCheckOut.minutes < standardOutMinutes) {
                    const diffMinutes = standardOutMinutes - roundedCheckOut.minutes;
                    finalStatus = `Về sớm ${getEarlyLeaveText(diffMinutes)}`;
                } else {
                    finalStatus = todayExistingRecord.status === 'Đi trễ' ? 'Đi trễ' : 'Đi làm';
                }
            } else {
                Swal.fire({
                    icon: 'warning',
                    title: 'Chưa tới giờ chấm công ra!',
                    text: 'Chỉ được phép chấm công ra từ 12:00 trưa.',
                    confirmButtonColor: '#f59e0b'
                });
                return;
            }
        }
    }

    const btn = document.getElementById('saveBtn');
    const spinner = document.getElementById('btnSpinner');
    const btnText = document.getElementById('btnText');

    btn.disabled = true;
    spinner.style.display = 'block';
    btnText.textContent = 'Đang xử lý...';

    try {
        const todayRef = doc(getUserAttendanceCollection(), date);
        const todaySnapshot = await getDoc(todayRef);
        const existingRecord = todayExistingRecord || todaySnapshot.data();

        if (todaySnapshot.exists()) {
            await setDoc(todayRef, {
                status: finalStatus,
                checkIn: isLeaveStatus ? "Nghỉ" : existingRecord.checkIn,
                checkOut: isLeaveStatus ? "Nghỉ" : calculatedCheckOut,
                updatedAt: serverTimestamp()
            }, { merge: true });
        } else {
            await setDoc(todayRef, {
                date: date,
                status: finalStatus,
                checkIn: calculatedCheckIn,
                checkOut: calculatedCheckOut ? calculatedCheckOut : "Chưa chấm",
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
        }

        Swal.fire({
            icon: isLeaveStatus ? 'info' : (finalStatus === 'Đi trễ' ? 'warning' : 'success'),
            title: `Ghi nhận thành công!`,
            text: `Trạng thái: ${finalStatus.toUpperCase()}`,
            timer: 1800,
            showConfirmButton: false
        });

        await loadAttendance();
    } catch (e) {
        console.error(e);
        Swal.fire('Lỗi', 'Không thể lưu dữ liệu.', 'error');
    } finally {
        spinner.style.display = 'none';
        updateButtonState();
    }
};

async function loadAttendance() {
    const listDiv = document.getElementById('attendanceList');
    showPageLoader('Đang tải lịch sử chấm công...');
    listDiv.setAttribute('aria-busy', 'true');
    listDiv.innerHTML = createAttendanceSkeleton();

    try {
        await syncExpiredAttendanceStatus();
        const querySnapshot = await getDocs(query(getUserAttendanceCollection(), orderBy('date', 'desc')));

        listDiv.innerHTML = '';
        globalAttendanceData = [];
        todayExistingRecord = null;

        if (querySnapshot.empty) {
            listDiv.innerHTML = `
                <div class="empty-state">
                    <strong>Chưa có dữ liệu chấm công</strong>
                    <span>Hãy ghi nhận ngày công đầu tiên của bạn.</span>
                </div>`;
            updateButtonState();
            updateMonthStats();
            renderCalendar();
            return;
        }

        const migrationBatches = [];
        let migrationBatch = writeBatch(db);
        let migrationCount = 0;
        querySnapshot.forEach((documentSnap) => {
            const data = documentSnap.data();
            const normalized = normalizeEarlyLeaveRecord(data);
            globalAttendanceData.push(normalized.record);

            if (normalized.changed) {
                migrationBatch.set(documentSnap.ref, {
                    checkOut: normalized.record.checkOut,
                    status: normalized.record.status,
                    updatedAt: serverTimestamp()
                }, { merge: true });
                migrationCount++;
                if (migrationCount === 450) {
                    migrationBatches.push(migrationBatch.commit());
                    migrationBatch = writeBatch(db);
                    migrationCount = 0;
                }
            }

            if (normalized.record.date === todayStr) {
                todayExistingRecord = normalized.record;
            }
        });
        if (migrationCount > 0) migrationBatches.push(migrationBatch.commit());
        if (migrationBatches.length) await Promise.all(migrationBatches);

        globalAttendanceData.sort((a, b) => b.date.localeCompare(a.date));

        if (todayExistingRecord) {
            const statusSelect = document.getElementById('status');
            if (typeof todayExistingRecord.status !== 'string' || !todayExistingRecord.status.includes('Nghỉ')) {
                statusSelect.value = 'Đi làm';
            } else {
                statusSelect.value = todayExistingRecord.status;
            }
            const resetBtn = document.getElementById('resetTodayBtn');
            if (resetBtn) {
                resetBtn.classList.remove('hidden');
            }
        } else {
            const resetBtn = document.getElementById('resetTodayBtn');
            if (resetBtn) {
                resetBtn.classList.add('hidden');
            }
        }

        updateButtonState();
        renderAttendanceList();
        updateMonthStats();
        renderCalendar();
        preparePrintData();
        localStorage.setItem(`attendance-cache-${currentUser.uid}`, JSON.stringify(globalAttendanceData));
    } catch (e) {
        console.error(e);
        const cached = localStorage.getItem(`attendance-cache-${currentUser.uid}`);
        if (cached) {
            globalAttendanceData = JSON.parse(cached);
            todayExistingRecord = globalAttendanceData.find(item => item.date === todayStr) || null;
            updateButtonState();
            renderAttendanceList();
            updateMonthStats();
            renderCalendar();
            preparePrintData();
        } else {
            listDiv.innerHTML = `
                <div class="empty-state">
                    <strong>Không thể tải dữ liệu</strong>
                    <span>Vui lòng kiểm tra kết nối và thử lại.</span>
                </div>`;
        }
    } finally {
        listDiv.removeAttribute('aria-busy');
        hidePageLoader();
    }
}

function preparePrintData() {
    let tableRows = '';
    const sortedData = [...getFilteredData()].sort((a, b) => a.date.localeCompare(b.date));

    sortedData.forEach((item, index) => {
        tableRows += `
                    <tr style="border-bottom: 1px solid #cbd5e1;">
                        <td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: center;">${index + 1}</td>
                        <td style="padding: 6px 8px; border: 1px solid #cbd5e1;">${escapeHtml(item.date)}</td>
                        <td style="padding: 6px 8px; border: 1px solid #cbd5e1;">${escapeHtml(item.status)}</td>
                        <td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: center;">${escapeHtml(item.checkIn || '--:--')}</td>
                        <td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: center;">${escapeHtml(item.checkOut || '--:--')}</td>
                    </tr>
                `;
    });

    document.getElementById('print-table-body').innerHTML = tableRows;

    const printDateRangeElem = document.getElementById('print-date-range');
    if (sortedData.length > 0) {
        printDateRangeElem.textContent = `Thời gian báo cáo: Từ ngày ${sortedData[0].date} đến ngày ${sortedData[sortedData.length - 1].date}`;
    } else {
        printDateRangeElem.textContent = 'Không có dữ liệu chấm công';
    }

    const summaryBox = document.getElementById('print-summary-box');
    const stats = getReportStats();
    summaryBox.innerHTML = `
                <div class="print-summary-card">Ngày công<strong>${stats.totalWorkDays}</strong></div>
                <div class="print-summary-card">Ngày nghỉ<strong>${stats.leaveDetails.length}</strong></div>
                <div class="print-summary-card">Thiếu giờ<strong>${stats.missingCheckLogs.length}</strong></div>
                <div class="print-summary-card">Tổng giờ<strong>${stats.totalWorkMinutes ? (stats.totalWorkMinutes / 60).toFixed(1) : '0.0'}</strong></div>
            `;
    document.getElementById('print-details').innerHTML = `
                <p><b>Ngày nghỉ:</b> ${stats.leaveDetails.length ? stats.leaveDetails.map(escapeHtml).join(', ') : 'Không có'}</p>
                <p><b>Ngày thiếu giờ:</b> ${stats.missingCheckLogs.length ? stats.missingCheckLogs.map(escapeHtml).join(', ') : 'Không có'}</p>
            `;
    document.getElementById('print-user-name').textContent =
        document.getElementById('userDisplayName').textContent || 'Người dùng';
    document.getElementById('print-created-at').textContent =
        `Ngày in: ${new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date())}`;
}

function getReportStats(data = getFilteredData()) {
    const leaveDetails = [];
    const missingCheckLogs = [];
    let totalWorkDays = 0;
    let totalWorkMinutes = 0;

    data.forEach(item => {
        const status = typeof item.status === 'string' ? item.status : 'Không xác định';
        const isLeave = status.includes('Nghỉ');
        if (isLeave) {
            leaveDetails.push(`• ${item.date}: ${status}`);
        } else {
            totalWorkDays++;
            if (!item.checkIn || item.checkIn === 'Chưa chấm' || !item.checkOut || item.checkOut === 'Chưa chấm') {
                missingCheckLogs.push(`• Ngày ${item.date} (Vào: ${item.checkIn || 'Thiếu'}, Ra: ${item.checkOut || 'Thiếu'})`);
            } else {
                const checkIn = parseTime(item.checkIn);
                const checkOut = parseTime(item.checkOut);
                if (checkIn !== null && checkOut !== null && checkOut >= checkIn) {
                    totalWorkMinutes += checkOut - checkIn;
                }
            }
        }
    });

    return { totalWorkDays, leaveDetails, missingCheckLogs, totalWorkMinutes };
}

window.openReportModal = function () {
    if (getFilteredData().length === 0) {
        Swal.fire('Trống', 'Chưa có dữ liệu để tổng hợp báo cáo.', 'info');
        return;
    }

    const { totalWorkDays, leaveDetails, missingCheckLogs } = getReportStats();

    let htmlContent = `
                <div style="text-align: left; font-size: 0.95rem; line-height: 1.6;">
                    <p><b>✨ Tổng số ngày công:</b> ${totalWorkDays} ngày</p>
                    <p><b>🏖️ Danh sách ngày nghỉ:</b></p>
                    <div style="background: #f1f5f9; padding: 8px 12px; border-radius: 8px; margin-bottom: 8px; max-height: 100px; overflow-y: auto;">
                        ${leaveDetails.length > 0 ? leaveDetails.map(escapeHtml).join('<br>') : 'Không có ngày nghỉ nào.'}
                    </div>
                    <p><b>⚠️ Thiếu giờ (Vào/Ra):</b></p>
                    <div style="background: #fef2f2; color: #b91c1c; padding: 8px 12px; border-radius: 8px; max-height: 100px; overflow-y: auto;">
                        ${missingCheckLogs.length > 0 ? missingCheckLogs.map(escapeHtml).join('<br>') : 'Tuyệt vời! Không có ngày nào bị thiếu giờ.'}
                    </div>
                </div>
            `;

    Swal.fire({
        title: '📊 Bảng Thống Kê Ngày Công',
        html: htmlContent,
        showCancelButton: true,
        confirmButtonText: '🖨️ In Báo Cáo',
        cancelButtonText: 'Đóng',
        confirmButtonColor: '#4f46e5',
        cancelButtonColor: '#64748b'
    }).then((result) => {
        if (result.isConfirmed) {
            preparePrintData();
            window.print();
        }
    });
};

window.resetTodayRecord = async function () {
    Swal.fire({
        title: 'Xác nhận xóa',
        text: 'Bạn chắc chắn muốn xóa record hôm nay? Sau đó bạn có thể chấm lại.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Xác nhận',
        cancelButtonText: 'Hủy'
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                showPageLoader('Xóa record hôm nay...');
                const todayDocRef = doc(getUserAttendanceCollection(), todayStr);
                await deleteDoc(todayDocRef);
                
                // Reset dữ liệu và UI
                todayExistingRecord = null;
                globalAttendanceData = globalAttendanceData.filter(item => item.date !== todayStr);
                
                // Reset status dropdown về "Đi làm"
                document.getElementById('status').value = 'Đi làm';
                
                // Ẩn nút xóa và update
                const resetBtn = document.getElementById('resetTodayBtn');
                if (resetBtn) {
                    resetBtn.classList.add('hidden');
                }
                
                // Enable lại nút save
                updateButtonState();

                // Refresh UI
                renderAttendanceList();
                updateMonthStats();
                renderCalendar();
                preparePrintData();

                hidePageLoader();
                Swal.fire('Thành công!', 'Record hôm nay đã bị xóa. Bạn có thể chấm lại.', 'success');
            } catch (e) {
                console.error(e);
                hidePageLoader();
                Swal.fire('Lỗi', 'Không thể xóa record.', 'error');
            }
        }
    });
};

window.enableReminders = async function () {
    if (!('Notification' in window)) {
        Swal.fire('Không hỗ trợ', 'Trình duyệt này không hỗ trợ thông báo.', 'info');
        return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
        Swal.fire('Chưa bật thông báo', 'Bạn cần cho phép thông báo trong trình duyệt.', 'warning');
        return;
    }
    localStorage.setItem(`attendance-reminders-${currentUser.uid}`, 'true');
    scheduleReminders();
    new Notification('Nhắc chấm công', { body: 'Đã bật nhắc lúc 08:20 và 18:20 khi trang đang mở.' });
    Swal.fire({ icon: 'success', title: 'Đã bật nhắc', text: 'Hãy mở trang vào các khung giờ nhắc để nhận thông báo.', timer: 1800, showConfirmButton: false });
};

function scheduleReminders() {
    if (!currentUser || localStorage.getItem(`attendance-reminders-${currentUser.uid}`) !== 'true') return;
    if (window.attendanceReminderTimer) clearInterval(window.attendanceReminderTimer);
    window.attendanceReminderTimer = setInterval(() => {
        const parts = new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false
        }).formatToParts(new Date());
        const hour = parts.find(part => part.type === 'hour').value;
        const minute = parts.find(part => part.type === 'minute').value;
        const key = `${todayStr}-${hour}:${minute}`;
        if ((hour === '08' && minute === '20' || hour === '18' && minute === '20')
            && localStorage.getItem('last-attendance-reminder') !== key
            && Notification.permission === 'granted') {
            localStorage.setItem('last-attendance-reminder', key);
            new Notification('Nhắc chấm công', { body: 'Bạn hãy kiểm tra và ghi nhận chấm công hôm nay.' });
        }
    }, 30000);
}

function getAvailableMonths() {
    const months = new Set();
    globalAttendanceData.forEach(record => {
        if (record && record.date) {
            const monthKey = record.date.slice(0, 7);
            months.add(monthKey);
        }
    });
    return Array.from(months).sort().reverse();
}

window.confirmClearData = function () {
    const availableMonths = getAvailableMonths();
    
    if (availableMonths.length === 0) {
        Swal.fire('Không có dữ liệu', 'Không có dữ liệu nào để xóa.', 'info');
        return;
    }

    const monthOptions = availableMonths.map(month => {
        const [year, monthNum] = month.split('-');
        const monthName = new Intl.DateTimeFormat('vi-VN', { month: 'long', year: 'numeric' })
            .format(new Date(year, parseInt(monthNum) - 1));
        return { value: month, text: monthName };
    });

    let selectedMonth = availableMonths[0];

    Swal.fire({
        title: 'Xóa Dữ Liệu Chấm Công',
        html: `
            <div style="text-align: left; margin: 20px 0;">
                <p style="margin-bottom: 10px;"><strong>Chọn tháng muốn xóa:</strong></p>
                <select id="clearMonthSelect" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 5px; font-size: 1rem;">
                    ${monthOptions.map(opt => `<option value="${opt.value}">${opt.text}</option>`).join('')}
                </select>
                <p style="color: #ef4444; margin-top: 15px; font-size: 0.9rem;">⚠️ Hành động này chỉ xóa dữ liệu của tháng được chọn!</p>
            </div>
        `,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Xác nhận xóa',
        cancelButtonText: 'Hủy bỏ',
        didOpen: () => {
            const select = document.getElementById('clearMonthSelect');
            select.addEventListener('change', (e) => {
                selectedMonth = e.target.value;
            });
        }
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                const querySnapshot = await getDocs(getUserAttendanceCollection());
                const batches = [];
                let batch = writeBatch(db);
                let deleteCount = 0;
                
                querySnapshot.docs.forEach((record, index) => {
                    const recordData = record.data();
                    if (recordData.date && recordData.date.startsWith(selectedMonth)) {
                        batch.delete(record.ref);
                        deleteCount++;
                        if (deleteCount % 450 === 0) {
                            batches.push(batch.commit());
                            batch = writeBatch(db);
                        }
                    }
                });
                
                if (deleteCount % 450 !== 0 && deleteCount > 0) batches.push(batch.commit());
                if (batches.length > 0) await Promise.all(batches);

                const monthName = new Intl.DateTimeFormat('vi-VN', { month: 'long', year: 'numeric' })
                    .format(new Date(selectedMonth.split('-')[0], parseInt(selectedMonth.split('-')[1]) - 1));
                
                Swal.fire('Đã xóa!', `Dữ liệu tháng ${monthName} đã được xóa (${deleteCount} ngày).`, 'success');
                await loadAttendance();
            } catch (e) {
                console.error(e);
                Swal.fire('Lỗi', 'Không thể xóa dữ liệu.', 'error');
            }
        }
    });
};

document.getElementById('saveBtn').addEventListener('click', window.saveAttendance);
document.getElementById('saveProfileBtn').addEventListener('click', window.saveProfile);
document.getElementById('resetTodayBtn').addEventListener('click', window.resetTodayRecord);
document.querySelector('[data-action="report"]').addEventListener('click', window.openReportModal);
document.querySelector('[data-action="reminders"]').addEventListener('click', window.enableReminders);
document.querySelector('[data-action="clear-data"]').addEventListener('click', window.confirmClearData);
document.getElementById('status').addEventListener('change', window.updateButtonState);

onAuthStateChanged(auth, async (user) => {
    showPageLoader(user ? 'Đang tải dữ liệu tài khoản...' : 'Đang kiểm tra phiên đăng nhập...');
    currentUser = user;
    if (!user) {
        resetLoginForm();
        authScreen.classList.remove('hidden');
        appScreen.classList.add('hidden');
        attendanceCollection = null;
        hidePageLoader();
        return;
    }

    try {
        attendanceCollection = getUserAttendanceCollection();
        authScreen.classList.add('hidden');
        appScreen.classList.remove('hidden');
        const isAdmin = user.email?.toLowerCase() === adminEmail;
        document.getElementById('adminPanel').classList.toggle('hidden', !isAdmin);
        document.getElementById('employeeWorkspace').classList.toggle('hidden', isAdmin);
        document.getElementById('appTitle').textContent = isAdmin ? 'Bảng quản lý nhân viên' : 'Sổ chấm công cá nhân';
        const profileSnapshot = await getDoc(doc(db, 'users', user.uid));
        const profile = profileSnapshot.exists() ? profileSnapshot.data() : {};
        const displayName = profile.displayName || user.displayName || user.email || 'Người dùng';
        const displayNameInput = document.getElementById('displayNameInput');
        if (displayNameInput) displayNameInput.value = profile.displayName || user.displayName || '';
        document.getElementById('userDisplayName').textContent = `Xin chào, ${displayName}`;
        updateUserAvatar(displayName);
        const roleLabel = document.getElementById('userRoleLabel');
        if (roleLabel) roleLabel.textContent = isAdmin ? 'Quản trị viên' : (profile.role || 'Nhân viên');
        if (isAdmin) {
            await loadEmployees();
        } else {
            await loadAttendance();
            scheduleReminders();
        }
    } catch (error) {
        console.error(error);
        appScreen.classList.add('hidden');
        authScreen.classList.remove('hidden');
        authError.textContent = 'Không thể tải dữ liệu tài khoản. Vui lòng thử lại.';
    } finally {
        hidePageLoader();
    }
});
