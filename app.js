import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, onSnapshot, deleteDoc, doc, addDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyC_yoH8VeSKl41tOBJnwZpLHwmzjQJhrZc",
  authDomain: "kort-tenisowy.firebaseapp.com",
  projectId: "kort-tenisowy",
  storageBucket: "kort-tenisowy.firebasestorage.app",
  messagingSenderId: "383734758095",
  appId: "1:383734758095:web:ec75c1317d3deddefd15ba"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const reservationsCol = collection(db, "reservations");
const partnerBoardCol = collection(db, "partner_board");

let allReservations = [];
let selectedSlots = [];

// ==========================================
// FUNKCJE POMOCNICZE
// ==========================================

function getPrevTime(time) {
    let [h, m] = time.split(':').map(Number);
    if (m === 30) m = 0; else { h -= 1; m = 30; }
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function getNextTime(time) {
    let [h, m] = time.split(':').map(Number);
    if (m === 0) m = 30; else { h += 1; m = 0; }
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function findReservationAt(date, time, list) {
    const fullIso = `${date}T${time}`;
    return list.find(r => (r.date === date && r.time === time) || (r.bookedTimes && r.bookedTimes.includes(fullIso)));
}

function findConnectedBlock(targetTime, targetDate, targetName, list) {
    const dayRes = list.filter(r => {
        const isSameUser = r.firstName === targetName;
        const isSameDate = r.date === targetDate || (r.bookedTimes && r.bookedTimes.some(t => t.startsWith(targetDate)));
        return isSameUser && isSameDate;
    });
    const startRes = findReservationAt(targetDate, targetTime, dayRes);
    if (!startRes) return [];
    let block = [startRes];
    let foundNew = true;
    while (foundNew) {
        foundNew = false;
        for (let r of dayRes) {
            if (block.includes(r)) continue;
            const isNeighbor = block.some(b => {
                const bTime = b.time || (b.bookedTimes ? b.bookedTimes[0].split('T')[1] : "");
                if (r.bookedTimes) return r.bookedTimes.some(t => getNextTime(bTime) === t.split('T')[1] || getPrevTime(bTime) === t.split('T')[1]);
                return getNextTime(bTime) === r.time || getPrevTime(bTime) === r.time;
            });
            if (isNeighbor) { block.push(r); foundNew = true; }
        }
    }
    return block;
}

function getReservationRange(res, allRes, dateStr) {
    const timeToSearch = res.time || (res.bookedTimes ? res.bookedTimes[0].split('T')[1] : "");
    const block = findConnectedBlock(timeToSearch, dateStr, res.firstName, allRes);
    if (block.length === 0) return "";
    block.sort((a, b) => (a.time || a.bookedTimes[0].split('T')[1]).localeCompare(b.time || b.bookedTimes[0].split('T')[1]));
    const start = block[0].time || block[0].bookedTimes[0].split('T')[1];
    const last = block[block.length - 1].time || block[block.length - 1].bookedTimes[block[block.length - 1].bookedTimes.length - 1].split('T')[1];
    let [h, m] = last.split(':').map(Number);
    m += 30; if (m === 60) { h += 1; m = 0; }
    return `${start}-${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

// PRZYWRÓCONO: GENEROWANIE LINKÓW DO KALENDARZA
function generateCalendarLinks(slots) {
    if (slots.length === 0) return;
    slots.sort((a, b) => a.time.localeCompare(b.time));
    const date = slots[0].date.replace(/-/g, '');
    const startTime = slots[0].time.replace(':', '') + '00';
    let [h, m] = slots[slots.length - 1].time.split(':').map(Number);
    m += 30; if (m === 60) { h += 1; m = 0; }
    const endTime = `${h.toString().padStart(2, '0')}${m.toString().padStart(2, '0')}00`;
    const title = encodeURIComponent("Kort Tenisowy - Triton");
    const dates = `${date}T${startTime}/${date}T${endTime}`;

    document.getElementById("googleCalBtn").href = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dates}`;
    document.getElementById("icsCalBtn").onclick = () => {
        const ics = `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nDTSTART:${date}T${startTime}\nDTEND:${date}T${endTime}\nSUMMARY:Kort Tenisowy\nEND:VEVENT\nEND:VCALENDAR`;
        const blob = new Blob([ics], { type: 'text/calendar' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'rezerwacja.ics'; a.click();
    };
}

// ==========================================
// REZERWACJA KORTU
// ==========================================

function renderCalendar() {
    const calendarEl = document.getElementById("calendar");
    if (!calendarEl) return;
    calendarEl.innerHTML = "";
    for (let i = 0; i < 7; i++) {
        const d = new Date(); d.setDate(d.getDate() + i);
        const dateStr = d.toISOString().split('T')[0];
        const dayCol = document.createElement("div");
        dayCol.className = "day-column";
        dayCol.innerHTML = `<div class="day-header"><strong>${d.toLocaleDateString('pl-PL', { weekday: 'short' })}.</strong><span>${d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' })}</span></div>`;
        for (let hour = 6; hour < 23; hour++) {
            for (let min of ["00", "30"]) {
                const timeStr = `${hour.toString().padStart(2, '0')}:${min}`;
                const slotDiv = document.createElement("div");
                slotDiv.className = "time-slot";
                const res = findReservationAt(dateStr, timeStr, allReservations);
                if (res) {
                    slotDiv.classList.add("booked");
                    const prevT = getPrevTime(timeStr);
                    const prevRes = findReservationAt(dateStr, prevT, allReservations);
                    if (prevRes && prevRes.firstName === res.firstName) slotDiv.classList.add("is-continuation");
                    else {
                        const range = getReservationRange(res, allReservations, dateStr);
                        slotDiv.innerHTML = `<div class="res-content"><div class="res-time">${range}</div><div class="res-user">${res.firstName}, ${res.address}</div></div>`;
                    }
                    slotDiv.onclick = () => cancelReservation(res, dateStr, timeStr);
                } else {
                    slotDiv.innerText = timeStr;
                    if (selectedSlots.some(s => s.date === dateStr && s.time === timeStr)) slotDiv.classList.add("selected");
                    slotDiv.onclick = () => toggleSelectSlot(dateStr, timeStr);
                }
                dayCol.appendChild(slotDiv);
            }
        }
        calendarEl.appendChild(dayCol);
    }
}

function toggleSelectSlot(date, time) {
    const idx = selectedSlots.findIndex(s => s.date === date && s.time === time);
    if (idx > -1) selectedSlots.splice(idx, 1);
    else {
        const fName = localStorage.getItem('userName') || "Użytkownik";
        const virtualAll = [...allReservations, ...selectedSlots.map(s => ({...s, firstName: fName})), {date, time, firstName: fName}];
        if (findConnectedBlock(time, date, fName, virtualAll).length > 4) return alert("Pojedynczy blok rezerwacji nie może przekraczać 2 godzin!");
        selectedSlots.push({ date, time });
    }
    document.getElementById("reserveBtn").style.display = selectedSlots.length > 0 ? "block" : "none";
    renderCalendar();
}

async function confirmBooking() {
    const fName = document.getElementById("inputFirstName").value.trim();
    const addr = document.getElementById("inputAddress").value.trim();
    const pin = document.getElementById("inputPin").value;
    if (!fName || !addr || pin.length < 4) return alert("Wypełnij dane!");
    
    localStorage.setItem('userName', fName);
    localStorage.setItem('userAddress', addr);
    localStorage.setItem('userPin', pin);

    // Wygeneruj linki do kalendarza przed wyczyszczeniem wybranych slotów
    generateCalendarLinks([...selectedSlots]);

    for (let s of selectedSlots) await addDoc(reservationsCol, { ...s, firstName: fName, address: addr, pin: pin });
    selectedSlots = [];
    document.getElementById("bookingModal").classList.remove("active");
    document.getElementById("successPin").innerText = pin;
    document.getElementById("successModal").classList.add("active");
}

async function cancelReservation(res, date, time) {
    const savedPin = localStorage.getItem('userPin');
    let shouldDelete = false;
    if (savedPin === res.pin || savedPin === "9988") {
        if (confirm(`Usunąć rezerwację?`)) shouldDelete = true;
    } else {
        const pin = prompt(`Podaj PIN dla ${res.firstName}:`);
        if (pin === res.pin || pin === "9988") shouldDelete = true;
        else if (pin !== null) alert("Błędny PIN!");
    }
    if (shouldDelete) {
        const blockToDel = findConnectedBlock(time, date, res.firstName, allReservations);
        for (let item of blockToDel) await deleteDoc(doc(db, "reservations", item.id));
    }
}

// GIEŁDA GRACZY
const boardOverlay = document.getElementById("partnerBoard");
const postModal = document.getElementById("postModal");

document.getElementById("openBoardBtn").onclick = () => boardOverlay.style.display = "block";
document.getElementById("closeBoardBtn").onclick = () => boardOverlay.style.display = "none";

document.getElementById("addPostBtn").onclick = () => {
    document.getElementById("postName").value = localStorage.getItem('userName') || "";
    document.getElementById("postAddress").value = localStorage.getItem('userAddress') || "";
    document.getElementById("postPin").value = localStorage.getItem('userPin') || "";
    postModal.classList.add("active");
};

document.getElementById("cancelPostBtn").onclick = () => postModal.classList.remove("active");

document.getElementById("savePostBtn").onclick = async () => {
    const name = document.getElementById("postName").value.trim();
    const addr = document.getElementById("postAddress").value.trim();
    const level = document.getElementById("postLevel").value;
    const avail = document.getElementById("postAvailability").value.trim();
    const cont = document.getElementById("postContact").value.trim();
    const pin = document.getElementById("postPin").value;
    if (!name || !avail || !cont || pin.length < 4) return alert("Wypełnij pola!");
    await addDoc(partnerBoardCol, { name, address: addr, level, avail, contact: cont, pin, createdAt: new Date().toISOString() });
    postModal.classList.remove("active");
};

window.deletePost = async (id, correctPin) => {
    const savedPin = localStorage.getItem('userPin');
    if (savedPin === correctPin || savedPin === "9988") {
        if (confirm("Usunąć ogłoszenie?")) await deleteDoc(doc(db, "partner_board", id));
    } else {
        const pin = prompt("Podaj PIN:");
        if (pin === correctPin || pin === "9988") await deleteDoc(doc(db, "partner_board", id));
    }
};

// NASŁUCHIWANIE BAZY
onSnapshot(reservationsCol, (snap) => { 
    allReservations = snap.docs.map(d => ({ id: d.id, ...d.data() })); 
    renderCalendar(); 
});

onSnapshot(partnerBoardCol, (snap) => {
    const list = document.getElementById("postsList"); if (!list) return; list.innerHTML = "";
    const limit = new Date(new Date().getTime() - (7 * 24 * 60 * 60 * 1000));
    const docs = snap.docs.map(d => ({id: d.id, ...d.data()})).sort((a,b) => b.createdAt.localeCompare(a.createdAt));
    docs.forEach(async (post) => {
        if (post.createdAt && new Date(post.createdAt) < limit) { await deleteDoc(doc(db, "partner_board", post.id)); return; }
        const card = document.createElement("div");
        card.className = "post-card";
        card.innerHTML = `<button class="del-post-btn" onclick="deletePost('${post.id}', '${post.pin}')">Usuń</button>
            <span class="level-badge level-${post.level}">${post.level}</span>
            <h3>${post.name}</h3><div class="post-meta">${post.address}</div>
            <div class="post-info"><strong>Dostępność:</strong> ${post.avail}</div>
            <div class="post-info"><strong>Kontakt:</strong> ${post.contact}</div>`;
        list.appendChild(card);
    });
});

document.getElementById("confirmBookingBtn").onclick = confirmBooking;
document.getElementById("reserveBtn").onclick = () => {
    document.getElementById("inputFirstName").value = localStorage.getItem('userName') || "";
    document.getElementById("inputAddress").value = localStorage.getItem('userAddress') || "";
    document.getElementById("inputPin").value = localStorage.getItem('userPin') || "";
    document.getElementById("bookingModal").classList.add("active");
};
document.getElementById("cancelModalBtn").onclick = () => document.getElementById("bookingModal").classList.remove("active");
document.getElementById("closeSuccessBtn").onclick = () => document.getElementById("successModal").classList.remove("active");

renderCalendar();