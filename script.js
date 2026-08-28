import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, getDocs, getDoc, setDoc, doc, query, orderBy, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

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

// Demo request: gọi window.simulateApiRequest() trong Console để xem trạng thái loading.
window.simulateApiRequest = function () {
    const list = document.getElementById('attendanceList');
    list.setAttribute('aria-busy', 'true');
    list.innerHTML = createAttendanceSkeleton();
    showPageLoader('Đang mô phỏng gọi API...');

    return new Promise(resolve => {
        setTimeout(() => {
            list.removeAttribute('aria-busy');
            list.innerHTML = `
                        <div class="item">
                            <div>
                                <div class="item-date">📅 ${todayStr}</div>
                                <div class="item-time"><span>Vào: <strong class="time-badge">08:00</strong></span><span>Ra: <strong class="time-badge">18:30</strong></span></div>
                            </div>
                            <span class="item-status status-lam">ĐI LÀM</span>
                        </div>
                    `;
            hidePageLoader();
            resolve({ ok: true, data: [{ date: todayStr, status: 'Đi làm', checkIn: '08:00', checkOut: '18:30' }] });
        }, 2000);
    });
};

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
    document.getElementById('employeeLoginMode').classList.toggle('active', !asAdmin);
    document.getElementById('adminLoginMode').classList.toggle('active', asAdmin);
    document.querySelector('#authScreen p').textContent = asAdmin
        ? 'Đăng nhập bằng tài khoản quản trị để quản lý nhân viên.'
        : 'Sử dụng tài khoản được cấp để xem dữ liệu cá nhân.';
}

document.getElementById('employeeLoginMode').addEventListener('click', () => setLoginMode(false));
document.getElementById('adminLoginMode').addEventListener('click', () => setLoginMode(true));

loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    authError.textContent = '';
    loginBtn.disabled = true;
    loginBtn.textContent = 'Đang đăng nhập...';
    try {
        await setPersistence(auth, browserLocalPersistence);
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
        loginBtn.textContent = 'Đăng nhập';
    }
});

document.getElementById('logoutBtn').addEventListener('click', () => signOut(auth));

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
    const attendanceDates = new Set(globalAttendanceData.map(item => item?.date));
    label.textContent = new Intl.DateTimeFormat('vi-VN', { month: 'long', year: 'numeric' }).format(firstDay);

    let cells = Array.from({ length: mondayFirstOffset }, () => '<span class="calendar-cell is-empty" aria-hidden="true"></span>');
    for (let day = 1; day <= daysInMonth; day++) {
        const date = getCalendarDateKey(year, month, day);
        const holiday = getHolidayInfo(date);
        const dayOfWeek = new Date(year, month, day).getDay();
        const classes = ['calendar-cell'];
        if (dayOfWeek === 0 || dayOfWeek === 6) classes.push('is-weekend');
        if (attendanceDates.has(date)) classes.push('is-work');
        if (holiday) classes.push('is-holiday');
        if (date === todayStr) classes.push('is-today');
        const labelText = holiday ? `${date}: ${holiday.name}` : `${date}: ${attendanceDates.has(date) ? 'Đã chấm công' : 'Chưa có dữ liệu'}`;
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
    const isPastDeadline = item.date === todayStr && (
        (missingCheckIn && currentMinutes > 12 * 60) ||
        (missingCheckOut && currentMinutes > 18 * 60 + 30)
    );
    return isPastDate || isPastDeadline ? 'Quên chấm công' : storedStatus || 'Không xác định';
}

async function syncExpiredAttendanceStatus() {
    const currentMinutes = getCurrentVietnamMinutes();
    const todayRef = doc(getUserAttendanceCollection(), todayStr);
    const todaySnapshot = await getDoc(todayRef);
    const todayData = todaySnapshot.exists() ? todaySnapshot.data() : null;
    const hasLeaveStatus = todayData && typeof todayData.status === 'string' && todayData.status.includes('Nghỉ');
    const missingCheckIn = !todayData || !todayData.checkIn || todayData.checkIn === 'Chưa chấm';
    const missingCheckOut = todayData && (!todayData.checkOut || todayData.checkOut === 'Chưa chấm');
    const missedCheckInDeadline = missingCheckIn && currentMinutes > 12 * 60;
    const missedCheckOutDeadline = missingCheckOut && currentMinutes > 18 * 60 + 30;

    if (!hasLeaveStatus && (missedCheckInDeadline || missedCheckOutDeadline)) {
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
    if (filteredData.length === 0) {
        listDiv.innerHTML = '<p style="text-align:center;color:var(--text-secondary);padding:20px;">Không có dữ liệu phù hợp.</p>';
        return;
    }
    const recentData = filteredData.slice(0, 4);
    let itemsHtml = '';
    recentData.forEach(data => {
        const safeStatus = getEffectiveStatus(data);
        const isLeave = safeStatus.includes('Nghỉ');
        const isLate = safeStatus === 'Đi trễ';
        const isEarly = safeStatus.startsWith('Về sớm');
        const isForgotten = safeStatus === 'Quên chấm công';
        let statusClass = isLeave ? 'status-nghi' : isForgotten ? 'status-quen' : isLate ? 'status-trễ' : isEarly ? 'status-som' : 'status-lam';
        const timeHtml = isLeave
            ? `<span>Trạng thái: <strong class="time-badge">${escapeHtml(safeStatus)}</strong></span>`
            : `<span>Vào: <strong class="time-badge">${escapeHtml(data.checkIn || 'Chưa chấm')}</strong></span><span>Ra: <strong class="time-badge">${escapeHtml(data.checkOut || 'Chưa chấm')}</strong></span>`;
        itemsHtml += `<div class="item"><div><div class="item-date">📅 ${escapeHtml(data.date)}${getHolidayInfo(data.date) ? ' 🎉' : ''}</div><div class="item-time">${timeHtml}</div></div><span class="item-status ${statusClass}">${escapeHtml(safeStatus)}</span></div>`;
    });
    listDiv.innerHTML = itemsHtml;
}

document.getElementById('reportMonth').addEventListener('change', renderAttendanceList);
document.getElementById('reportStatus').addEventListener('change', renderAttendanceList);

window.updateButtonState = function () {
    const statusVal = document.getElementById('status').value;
    const btn = document.getElementById('saveBtn');
    const btnText = document.getElementById('btnText');

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
            btnText.textContent = 'Hôm nay đã ghi nhận nghỉ (1/1)';
            return;
        } else if (existingStatus === 'Quên chấm công') {
            btn.disabled = true;
            btnText.textContent = 'Hôm nay đã ghi nhận quên chấm công';
            return;
        } else if (todayExistingRecord.checkIn && todayExistingRecord.checkIn !== 'Chưa chấm' &&
            todayExistingRecord.checkOut && todayExistingRecord.checkOut !== 'Chưa chấm') {
            btn.disabled = true;
            btnText.textContent = 'Đã hoàn tất chấm công hôm nay (Vào/Ra)';
            return;
        }

    }

    btn.disabled = false;
    if (statusVal.includes('Nghỉ')) {
        btn.classList.add('is-leave');
        btnText.textContent = 'Ghi Nhận Ngày Nghỉ (1 Lần)';
    } else {
        btn.classList.remove('is-leave');
        if (!todayExistingRecord || !todayExistingRecord.checkIn || todayExistingRecord.checkIn === 'Chưa chấm') {
            btnText.textContent = 'Chấm Công Vào (Lần 1)';
        } else {
            btnText.textContent = 'Chấm Công Ra (Lần 2)';
        }
    }
}

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
        document.getElementById('userDisplayName').textContent = `👤 ${displayName}`;
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
    const visibleEmployees = employees.filter(employee => {
        const text = `${employee.displayName || ''} ${employee.email || ''}`.toLowerCase();
        return text.includes(keyword);
    });

    if (!visibleEmployees.length) {
        list.innerHTML = '<p style="color:var(--text-secondary); text-align:center; padding:12px;">Không tìm thấy nhân viên.</p>';
        return;
    }

    list.innerHTML = visibleEmployees.map(employee => `
                <div class="employee-row">
                    <div class="employee-info">
                        <strong>${escapeHtml(employee.displayName || 'Chưa đặt tên')}</strong>
                        <span>${escapeHtml(employee.email || employee.uid)}</span>
                        <span>${employee.active === false ? 'Trạng thái: Đã khóa' : 'Trạng thái: Đang hoạt động'}</span>
                    </div>
                    <div class="employee-actions">
                        <button type="button" class="btn-secondary" data-view-attendance="${escapeHtml(employee.uid)}">Xem công</button>
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
    document.getElementById('totalEmployees').textContent = employees.length;
    document.getElementById('activeEmployees').textContent = employees.filter(employee => employee.active !== false).length;
    document.getElementById('checkedEmployees').textContent = todayRecords.filter(Boolean).length;
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
                    <td>${escapeHtml(record.date)}</td>
                    <td>${escapeHtml(record.status || '')}</td>
                    <td>${escapeHtml(record.checkIn || 'Chưa chấm')}</td>
                    <td>${escapeHtml(record.checkOut || 'Chưa chấm')}</td>
                </tr>
            `).join('') : '<tr><td colspan="4">Không có dữ liệu trong tháng này.</td></tr>';
    await Swal.fire({
        title: escapeHtml(employee.displayName || employee.email || 'Nhân viên'),
        html: `<div style="max-height:360px;overflow:auto;"><table style="width:100%;border-collapse:collapse;text-align:left;font-size:13px;"><thead><tr><th>Ngày</th><th>Trạng thái</th><th>Vào</th><th>Ra</th></tr></thead><tbody>${rows}</tbody></table></div>`,
        confirmButtonText: 'Đóng',
        width: 640
    });
}

async function editEmployee(uid) {
    const employee = employees.find(item => item.uid === uid);
    if (!employee) return;
    const result = await Swal.fire({
        title: 'Sửa nhân viên',
        input: 'text',
        inputValue: employee.displayName || '',
        inputLabel: 'Tên hiển thị',
        inputPlaceholder: 'Nhập tên nhân viên',
        showCancelButton: true,
        confirmButtonText: 'Lưu',
        cancelButtonText: 'Hủy',
        inputValidator: value => value.trim() ? undefined : 'Vui lòng nhập tên nhân viên.'
    });
    if (!result.isConfirmed) return;
    try {
        await setDoc(doc(db, 'users', uid), { displayName: result.value.trim() }, { merge: true });
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

document.getElementById('employeeSearch').addEventListener('input', renderEmployees);
document.getElementById('refreshEmployeesBtn').addEventListener('click', loadEmployees);
document.getElementById('adminMonth').value = todayStr.slice(0, 7);

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
        if (existingStatus.includes('Nghỉ')) {
            Swal.fire('Thông báo', 'Hôm nay bạn đã thực hiện ghi nhận nghỉ rồi (chỉ được phép 1 lần).', 'warning');
            return;
        }
        if (existingStatus === 'Quên chấm công') {
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
                    finalStatus = typeof todayExistingRecord.status === 'string' ? todayExistingRecord.status : 'Đi làm';
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
            listDiv.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 20px; font-size: 0.9rem;">Chưa có dữ liệu chấm công.</p>';
            updateButtonState();
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

        let itemsHtml = '';
        globalAttendanceData.forEach((data) => {
            const safeStatus = getEffectiveStatus(data);
            const isLeave = safeStatus.includes('Nghỉ');
            const isLate = safeStatus === 'Đi trễ';
            const isEarly = safeStatus.startsWith('Về sớm');
            const isForgotten = safeStatus === 'Quên chấm công';

            let statusClass = 'status-lam';
            if (isLeave) statusClass = 'status-nghi';
            else if (isForgotten) statusClass = 'status-quen';
            else if (isLate) statusClass = 'status-trễ';
            else if (isEarly) statusClass = 'status-som';

            let timeHtml = '';
            if (isLeave) {
                timeHtml = `<span>Trạng thái: <strong class="time-badge">${escapeHtml(safeStatus)}</strong></span>`;
            } else {
                timeHtml = `
                            <span>Vào: <strong class="time-badge">${escapeHtml(data.checkIn || 'Chưa chấm')}</strong></span>
                            <span>Ra: <strong class="time-badge">${escapeHtml(data.checkOut || 'Chưa chấm')}</strong></span>
                        `;
            }

            const itemHtml = `
                        <div class="item">
                            <div>
                                <div class="item-date">📅 ${escapeHtml(data.date)}</div>
                                <div class="item-time">${timeHtml}</div>
                            </div>
                            <span class="item-status ${statusClass}">${escapeHtml(safeStatus)}</span>
                        </div>
                    `;
            itemsHtml += itemHtml;
        });
        listDiv.innerHTML = itemsHtml;

        if (todayExistingRecord) {
            const statusSelect = document.getElementById('status');
            if (typeof todayExistingRecord.status !== 'string' || !todayExistingRecord.status.includes('Nghỉ')) {
                statusSelect.value = 'Đi làm';
            } else {
                statusSelect.value = todayExistingRecord.status;
            }
        }

        updateButtonState();
        renderAttendanceList();
        renderCalendar();
        preparePrintData();
        localStorage.setItem(`attendance-cache-${currentUser.uid}`, JSON.stringify(globalAttendanceData));
    } catch (e) {
        console.error(e);
        const cached = localStorage.getItem(`attendance-cache-${currentUser.uid}`);
        if (cached) {
            globalAttendanceData = JSON.parse(cached);
            renderAttendanceList();
            renderCalendar();
            preparePrintData();
        } else {
            listDiv.innerHTML = '<p style="text-align: center; color: #ef4444; padding: 20px; font-size: 0.9rem;">Không thể tải dữ liệu.</p>';
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

window.confirmClearData = function () {
    Swal.fire({
        title: 'Bạn có chắc chắn muốn xóa?',
        text: "Hành động này chỉ xóa lịch sử chấm công của tài khoản đang đăng nhập!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Xác nhận xóa',
        cancelButtonText: 'Hủy bỏ'
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                const querySnapshot = await getDocs(getUserAttendanceCollection());
                const batches = [];
                let batch = writeBatch(db);
                querySnapshot.docs.forEach((record, index) => {
                    batch.delete(record.ref);
                    if ((index + 1) % 450 === 0) {
                        batches.push(batch.commit());
                        batch = writeBatch(db);
                    }
                });
                if (querySnapshot.docs.length % 450 !== 0) batches.push(batch.commit());
                await Promise.all(batches);

                Swal.fire('Đã xóa!', 'Dữ liệu đã được xóa sạch.', 'success');
                await loadAttendance();
            } catch (e) {
                console.error(e);
                Swal.fire('Lỗi', 'Không thể xóa dữ liệu.', 'error');
            }
        }
    });
};

onAuthStateChanged(auth, async (user) => {
    showPageLoader(user ? 'Đang tải dữ liệu tài khoản...' : 'Đang kiểm tra phiên đăng nhập...');
    currentUser = user;
    if (!user) {
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
        document.getElementById('appTitle').textContent = isAdmin ? '👥 Bảng Quản Lý Nhân Viên' : '📅 Sổ Chấm Công Cá Nhân';
        const profileSnapshot = await getDoc(doc(db, 'users', user.uid));
        const profile = profileSnapshot.exists() ? profileSnapshot.data() : {};
        document.getElementById('displayNameInput').value = profile.displayName || user.displayName || '';
        document.getElementById('userDisplayName').textContent =
            `👤 ${profile.displayName || user.displayName || user.email}`;
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
