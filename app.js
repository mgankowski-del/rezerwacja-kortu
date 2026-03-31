import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, onSnapshot, deleteDoc, doc, addDoc, updateDoc, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

const SECRET_COACH_KOD = "TRENER2026"; 
let allReservations = [];
let selectedSlots = [];
let activeWorkshop = null;

// POMOCNICZE
function getPrevTime(t) { let [h, m] = t.split(':').map(Number); if (m === 30) m = 0; else { h -= 1; m = 30; } return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`; }
function getNextTime(t) { let [h, m] = t.split(':').map(Number); if (m === 0) m = 30; else { h += 1; m = 0; } return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`; }

function findReservationAt(date, time, list) {
    const fullIso = `${date}T${time}`;
    return list.find(r => (r.date === date && r.time === time) || (r.bookedTimes && r.bookedTimes.includes(fullIso)));
}

function findConnectedBlock(time, date, name, list) {
    const dayRes = list.filter(r => r.firstName === name && (r.date === date || (r.bookedTimes && r.bookedTimes.some(t => t.startsWith(date)))));
    const start = findReservationAt(date, time, dayRes);
    if (!start) return [];
    let block = [start], found = true;
    while (found) {
        found = false;
        for (let r of dayRes) {
            if (block.includes(r)) continue;
            const isNeighbor = block.some(b => {
                const bT = b.time || (b.bookedTimes ? b.bookedTimes[0].split('T')[1] : "");
                return r.bookedTimes ? r.bookedTimes.some(t => getNextTime(bT) === t.split('T')[1] || getPrevTime(bT) === t.split('T')[1]) : (getNextTime(bT) === r.time || getPrevTime(bT) === r.time);
            });
            if (isNeighbor) { block.push(r); found = true; }
        }
    }
    return block;
}

function getRange(res, allRes, dateStr) {
    const time = res.time || (res.bookedTimes ? res.bookedTimes[0].split('T')[1] : "");
    const block = findConnectedBlock(time, dateStr, res.firstName, allRes);
    if (!block.length) return "";
    block.sort((a,b) => (a.time || a.bookedTimes[0].split('T')[1]).localeCompare(b.time || b.bookedTimes[0].split('T')[1]));
    const s = block[0].time || block[0].bookedTimes[0].split('T')[1];
    const l = block[block.length-1].time || (block[block.length-1].bookedTimes ? block[block.length-1].bookedTimes[0].split('T')[1] : block[block.length-1].time);
    let [h, m] = l.split(':').map(Number); m += 30; if (m===60) {h+=1; m=0;}
    return `${s}-${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

// KALENDARZ I EKSPORT
function generateCalendarLinks(slots) {
    if (!slots.length) return;
    slots.sort((a, b) => a.time.localeCompare(b.time));
    const date = slots[0].date.replace(/-/g, '');
    const startTime = slots[0].time.replace(':', '') + '00';
    let [h, m] = slots[slots.length-1].time.split(':').map(Number);
    m += 30; if (m === 60) { h += 1; m = 0; }
    const endTime = `${h.toString().padStart(2, '0')}${m.toString().padStart(2, '0')}00`;
    document.getElementById("googleCalBtn").href = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=Tenis&dates=${date}T${startTime}/${date}T${endTime}`;
    document.getElementById("icsCalBtn").onclick = () => {
        const ics = `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nDTSTART:${date}T${startTime}\nDTEND:${date}T${endTime}\nSUMMARY:Tenis\nEND:VEVENT\nEND:VCALENDAR`;
        const blob = new Blob([ics], { type: 'text/calendar' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = 'tenis.ics'; a.click();
    };
}

function renderCalendar() {
    const calendarEl = document.getElementById("calendar");
    if (!calendarEl) return;
    calendarEl.innerHTML = "";
    for (let i = 0; i < 7; i++) {
        const d = new Date(); d.setDate(d.getDate() + i);
        const dateStr = d.toISOString().split('T')[0];
        const dayCol = document.createElement("div");
        dayCol.className = "day-column";
        dayCol.innerHTML = `<div class="day-header"><strong>${d.toLocaleDateString('pl-PL',{weekday:'short'})}.</strong><span>${d.toLocaleDateString('pl-PL',{day:'2-digit',month:'2-digit'})}</span></div>`;
        for (let hour = 6; hour < 23; hour++) {
            for (let min of ["00", "30"]) {
                const timeStr = `${hour.toString().padStart(2, '0')}:${min}`;
                const slotDiv = document.createElement("div");
                slotDiv.className = "time-slot";
                const res = findReservationAt(dateStr, timeStr, allReservations);
                if (res) {
                    const isWorkshop = res.type === "workshop";
                    slotDiv.classList.add(isWorkshop ? "workshop" : "booked");
                    const prevRes = findReservationAt(dateStr, getPrevTime(timeStr), allReservations);
                    if (prevRes && prevRes.firstName === res.firstName) slotDiv.classList.add("is-continuation");
                    else {
                        const range = getRange(res, allReservations, dateStr);
                        let userText = isWorkshop ? `🏆 ${res.address}` : `${res.firstName}, ${res.address}`;
                        slotDiv.innerHTML = `<div class="res-content"><div class="res-time">${range}</div><div class="res-user">${userText}</div>${isWorkshop ? `<div class="spots-left">Wolne: ${res.maxSpots - (res.participants?res.participants.length:0)}</div>` : ""}</div>`;
                    }
                    slotDiv.onclick = () => isWorkshop ? openJoinWorkshop(res) : cancelReservation(res, dateStr, timeStr);
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
        const virtual = [...allReservations, ...selectedSlots.map(s=>({...s, firstName:fName})), {date, time, firstName:fName}];
        if (findConnectedBlock(time, date, fName, virtual).length > 4) return alert("Max 2h!");
        selectedSlots.push({ date, time });
    }
    document.getElementById("reserveBtn").style.display = selectedSlots.length > 0 ? "block" : "none";
    renderCalendar();
}

// SZKOLENIA
document.getElementById("inputFirstName").oninput = (e) => {
    const isCoach = (e.target.value.trim() === SECRET_COACH_KOD);
    document.getElementById("workshopFields").style.display = isCoach ? "block" : "none";
    document.getElementById("labelAddress").innerText = isCoach ? "Opis szkolenia" : "Ulica i nr domu";
};

async function confirmBooking() {
    const fName = document.getElementById("inputFirstName").value.trim();
    const addr = document.getElementById("inputAddress").value.trim();
    const pin = document.getElementById("inputPin").value;
    const isWorkshop = (fName === SECRET_COACH_KOD);
    if (!fName || !addr || pin.length < 4) return alert("Wypełnij pola!");
    generateCalendarLinks([...selectedSlots]);
    for (let s of selectedSlots) {
        const data = { ...s, firstName: fName, address: addr, pin: pin };
        if (isWorkshop) { 
            data.type = "workshop"; 
            data.maxSpots = parseInt(document.getElementById("inputMaxSpots").value);
            data.donation = document.getElementById("inputDonation").value;
            data.blik = document.getElementById("inputBlik").value;
            data.coachNote = document.getElementById("inputCoachNote").value;
            data.coachName = document.getElementById("inputCoachDisplayName").value;
            data.participants = []; 
        }
        await addDoc(reservationsCol, data);
    }
    localStorage.setItem('userPin', pin);
    selectedSlots = []; document.getElementById("bookingModal").classList.remove("active");
    document.getElementById("successPin").innerText = pin; document.getElementById("successModal").classList.add("active");
}

function openJoinWorkshop(res) {
    activeWorkshop = res;
    const taken = res.participants ? res.participants.length : 0;
    const savedPin = localStorage.getItem('userPin');
    document.getElementById("coachDashboardBtn").innerText = `Trener ${res.coachName}`;
    document.getElementById("workshopDescriptionText").innerText = res.address;
    document.getElementById("donationValue").innerText = `${res.donation} zł`;
    document.getElementById("blikValue").innerText = res.blik;
    document.getElementById("spotsLeftCount").innerText = res.maxSpots - taken;
    const noteBox = document.getElementById("coachNoteBox");
    if (res.coachNote) { noteBox.style.display = "block"; document.getElementById("coachNoteText").innerText = res.coachNote; }
    else noteBox.style.display = "none";
    const listDiv = document.getElementById("participantsList");
    listDiv.innerHTML = (res.participants && res.participants.length > 0) 
        ? res.participants.map((p, i) => `<div class="participant-item"><div><strong>${p.name}</strong> (${p.age} l.)</div><button class="leave-btn" onclick="removeParticipant(${i})">Wypisz</button></div>`).join("")
        : "Brak zapisów.";
    document.getElementById("joinForm").style.display = (savedPin === res.pin || savedPin === "9988") ? "none" : "block";
    document.getElementById("joinWorkshopModal").classList.add("active");
}

window.removeParticipant = async (index) => {
    const p = activeWorkshop.participants[index];
    const inputPin = prompt(`Podaj PIN dziecka: ${p.name}`);
    if (inputPin === p.pin || inputPin === activeWorkshop.pin || inputPin === "9988") {
        await updateDoc(doc(db, "reservations", activeWorkshop.id), { participants: arrayRemove(p) });
        alert("Wypisano."); document.getElementById("joinWorkshopModal").classList.remove("active");
    } else if (inputPin !== null) alert("Błędny PIN!");
};

document.getElementById("confirmJoinBtn").onclick = async () => {
    const name = document.getElementById("joinName").value.trim();
    const pin = document.getElementById("joinPin").value.trim();
    if (!name || pin.length < 4) return alert("Podaj dane!");
    await updateDoc(doc(db, "reservations", activeWorkshop.id), { 
        participants: arrayUnion({ name, age: document.getElementById("joinAge").value, address: document.getElementById("joinAddress").value, pin, joinedAt: new Date().toISOString() }) 
    });
    generateCalendarLinks([{ date: activeWorkshop.date, time: activeWorkshop.time }]);
    localStorage.setItem('userPin', pin);
    document.getElementById("joinWorkshopModal").classList.remove("active");
    document.getElementById("successPin").innerText = pin; document.getElementById("successModal").classList.add("active");
};

// GIEŁDA GRACZY (PRZYWRÓCONA LOGIKA)
document.getElementById("savePostBtn").onclick = async () => {
    const name = document.getElementById("postName").value.trim();
    const addr = document.getElementById("postAddress").value.trim();
    const pin = document.getElementById("postPin").value;
    if (!name || !addr || pin.length < 4) return alert("Wypełnij wszystkie pola!");
    await addDoc(partnerBoardCol, {
        name, address: addr, level: document.getElementById("postLevel").value,
        contact: document.getElementById("postContact").value, pin, createdAt: new Date().toISOString()
    });
    document.getElementById("postModal").classList.remove("active");
};

window.deletePost = async (id, postPin) => {
    const input = prompt("Podaj PIN ogłoszenia:");
    if (input === postPin || input === "9988") {
        await deleteDoc(doc(db, "partner_board", id));
        alert("Ogłoszenie usunięte.");
    } else if (input !== null) alert("Błędny PIN!");
};

onSnapshot(partnerBoardCol, (snap) => {
    const list = document.getElementById("postsList");
    if (!list) return;
    list.innerHTML = "";
    snap.docs.map(d => ({id: d.id, ...d.data()})).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).forEach(post => {
        const card = document.createElement("div");
        card.className = "post-card";
        const lvlClass = post.level === "Zaawansowany" ? "lvl-pro" : (post.level === "Początkujący" ? "lvl-beg" : "lvl-mid");
        card.innerHTML = `
            <div class="post-level ${lvlClass}">${post.level}</div>
            <button class="leave-btn" style="position:absolute; top:15px; right:15px;" onclick="deletePost('${post.id}','${post.pin}')">Usuń</button>
            <h3 style="margin: 0 0 5px 0;">${post.name}</h3>
            <div style="font-size: 0.85rem; color: #64748b; margin-bottom: 10px;">Dom: ${post.address}</div>
            <div style="background: #fff; padding: 10px; border-radius: 10px; font-weight: 700; color: #1a2a47; border: 1px solid #edf2f7;">📞 ${post.contact}</div>
        `;
        list.appendChild(card);
    });
});

// PANEL TRENERA I RESZTA
document.getElementById("coachDashboardBtn").onclick = () => {
    const savedPin = localStorage.getItem('userPin');
    if (savedPin === activeWorkshop.pin || savedPin === "9988") openCoachDashboard();
    else {
        const input = prompt("Podaj PIN Trenera:");
        if (input === activeWorkshop.pin || input === "9988") openCoachDashboard();
    }
};

function openCoachDashboard() {
    document.getElementById("editCoachNote").value = activeWorkshop.coachNote || "";
    document.getElementById("coachDashboardModal").classList.add("active");
}

document.getElementById("saveNoteBtn").onclick = async () => {
    await updateDoc(doc(db, "reservations", activeWorkshop.id), { coachNote: document.getElementById("editCoachNote").value.trim() });
    alert("Zaktualizowano!"); document.getElementById("coachDashboardModal").classList.remove("active");
};

document.getElementById("coachCancelFullBtn").onclick = () => {
    if (confirm("Odwołać zajęcia?")) {
        cancelReservation(activeWorkshop, activeWorkshop.date, activeWorkshop.time);
        document.querySelectorAll(".modal").forEach(m => m.classList.remove("active"));
    }
};

async function cancelReservation(res, date, time) {
    const savedPin = localStorage.getItem('userPin');
    let shouldDelete = false;
    if (savedPin === res.pin || savedPin === "9988") shouldDelete = true;
    else { const pin = prompt("Podaj PIN:"); if (pin === res.pin || pin === "9988") shouldDelete = true; }
    if (shouldDelete) {
        const block = findConnectedBlock(time, date, res.firstName, allReservations);
        for (let item of block) await deleteDoc(doc(db, "reservations", item.id));
    }
}

// INIT
onSnapshot(reservationsCol, (snap) => {
    allReservations = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderCalendar();
    if (activeWorkshop) {
        const updated = allReservations.find(r => r.id === activeWorkshop.id);
        if (updated) refreshModalUI(updated);
    }
});

function refreshModalUI(res) {
    activeWorkshop = res;
    const taken = res.participants ? res.participants.length : 0;
    document.getElementById("spotsLeftCount").innerText = res.maxSpots - taken;
    document.getElementById("coachNoteText").innerText = res.coachNote || "";
    document.getElementById("coachNoteBox").style.display = res.coachNote ? "block" : "none";
    document.getElementById("participantsList").innerHTML = (res.participants && res.participants.length > 0) 
        ? res.participants.map((p, i) => `<div class="participant-item"><div><strong>${p.name}</strong></div><button class="leave-btn" onclick="removeParticipant(${i})">Wypisz</button></div>`).join("")
        : "Brak zapisów.";
}

document.getElementById("openBoardBtn").onclick = () => document.getElementById("partnerBoard").style.display = "block";
document.getElementById("closeBoardBtn").onclick = () => document.getElementById("partnerBoard").style.display = "none";
document.getElementById("addPostBtn").onclick = () => document.getElementById("postModal").classList.add("active");
document.getElementById("confirmBookingBtn").onclick = confirmBooking;
document.getElementById("reserveBtn").onclick = () => document.getElementById("bookingModal").classList.add("active");
document.querySelectorAll(".close-x, .cancel-modal-btn").forEach(b => b.onclick = () => document.querySelectorAll(".modal, .board-overlay").forEach(m => {m.classList.remove("active"); m.style.display="none";}));

renderCalendar();