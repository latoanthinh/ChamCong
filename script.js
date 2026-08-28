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
        const holidays = new Set(['01-01', '04-30', '05-01', '09-02']);

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
            let itemsHtml = '';
            filteredData.forEach(data => {
                const safeStatus = getEffectiveStatus(data);
                const isLeave = safeStatus.includes('Nghỉ');
                const isLate = safeStatus === 'Đi trễ';
                const isEarly = safeStatus.startsWith('Về sớm');
                const isForgotten = safeStatus === 'Quên chấm công';
                let statusClass = isLeave ? 'status-nghi' : isForgotten ? 'status-quen' : isLate ? 'status-trễ' : isEarly ? 'status-som' : 'status-lam';
                const timeHtml = isLeave
                    ? `<span>Trạng thái: <strong class="time-badge">${escapeHtml(safeStatus)}</strong></span>`
                    : `<span>Vào: <strong class="time-badge">${escapeHtml(data.checkIn || 'Chưa chấm')}</strong></span><span>Ra: <strong class="time-badge">${escapeHtml(data.checkOut || 'Chưa chấm')}</strong></span>`;
                itemsHtml += `<div class="item"><div><div class="item-date">📅 ${escapeHtml(data.date)}${holidays.has(data.date.slice(5)) ? ' 🎉' : ''}</div><div class="item-time">${timeHtml}</div></div><span class="item-status ${statusClass}">${escapeHtml(safeStatus)}</span></div>`;
            });
            listDiv.innerHTML = itemsHtml;
        }

        document.getElementById('reportMonth').addEventListener('change', renderAttendanceList);
        document.getElementById('reportStatus').addEventListener('change', renderAttendanceList);

        window.updateButtonState = function () {
            const statusVal = document.getElementById('status').value;
            const btn = document.getElementById('saveBtn');
            const btnText = document.getElementById('btnText');

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
            list.innerHTML = '<div class="admin-loading-row"></div><div class="admin-loading-row"></div><div class="admin-loading-row"></div>';
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

        function exportAllEmployeesCsv() {
            const month = document.getElementById('adminMonth').value;
            const rows = [['Nhân viên', 'Email', 'Ngày', 'Trạng thái', 'Giờ vào', 'Giờ ra']];
            employees.forEach(employee => {
                (employeeAttendance.get(employee.uid) || []).filter(record => !month || String(record.date || '').startsWith(month))
                    .forEach(record => rows.push([
                        employee.displayName || 'Chưa đặt tên', employee.email || '', record.date || '',
                        record.status || '', record.checkIn || 'Chưa chấm', record.checkOut || 'Chưa chấm'
                    ]));
            });
            if (rows.length === 1) {
                Swal.fire('Trống', 'Không có dữ liệu chấm công để xuất.', 'info');
                return;
            }
            const csv = rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\r\n');
            const link = document.createElement('a');
            link.href = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }));
            link.download = `bao-cao-nhan-vien-${month || todayStr}.csv`;
            link.click();
            URL.revokeObjectURL(link.href);
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
        document.getElementById('exportAllCsvBtn').addEventListener('click', exportAllEmployeesCsv);

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

                querySnapshot.forEach((documentSnap) => {
                    const data = documentSnap.data();
                    globalAttendanceData.push(data);

                    if (data.date === todayStr) {
                        todayExistingRecord = data;
                    }
                });

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
                preparePrintData();
                localStorage.setItem(`attendance-cache-${currentUser.uid}`, JSON.stringify(globalAttendanceData));
            } catch (e) {
                console.error(e);
                const cached = localStorage.getItem(`attendance-cache-${currentUser.uid}`);
                if (cached) {
                    globalAttendanceData = JSON.parse(cached);
                    renderAttendanceList();
                    preparePrintData();
                } else {
                    listDiv.innerHTML = '<p style="text-align: center; color: #ef4444; padding: 20px; font-size: 0.9rem;">Không thể tải dữ liệu.</p>';
                }
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

        window.exportCsv = function () {
            const data = [...getFilteredData()].sort((a, b) => a.date.localeCompare(b.date));
            if (data.length === 0) {
                Swal.fire('Trống', 'Không có dữ liệu phù hợp để xuất.', 'info');
                return;
            }
            const header = ['STT', 'Ngày', 'Trạng thái', 'Giờ vào', 'Giờ ra'];
            const rows = data.map((item, index) => [
                index + 1, item.date, item.status || '', item.checkIn || 'Chưa chấm', item.checkOut || 'Chưa chấm'
            ]);
            const csv = [header, ...rows].map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\r\n');
            const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `bao-cao-cham-cong-${todayStr}.csv`;
            link.click();
            URL.revokeObjectURL(link.href);
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
            currentUser = user;
            if (!user) {
                authScreen.classList.remove('hidden');
                appScreen.classList.add('hidden');
                attendanceCollection = null;
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
            }
        });
