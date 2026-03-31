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

const SECRET_COACH_KOD = "TRENER2026"; 
let allReservations = [];
let selectedSlots = [];
let activeWorkshop = null; // Przechowuje obiekt aktualnie otwartego szkolenia

// POMOCNICZE CZASU
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

// KALENDARZ
function generateCalendarLinks(slots) {
    if (!slots.length) return;
    slots.sort((a, b) => a.time.localeCompare(b.time));
    const date = slots[0].date.replace(/-/g, '');
    const startTime = slots[0].time.replace(':', '') + '00';
    let [h, m] = slots[slots.length-1].time.split(':').map(Number);
    m += 30; if (m === 60) { h += 1; m = 0; }
    const endTime = `${h.toString().padStart(2, '0')}${m.toString().padStart(2, '0')}00`;
    const title = encodeURIComponent("Kort Tenisowy - Triton");
    document.getElementById("googleCalBtn").href = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${date}T${startTime}/${date}T${endTime}`;
    document.getElementById("icsCalBtn").onclick = () => {
        const ics = `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nDTSTART:${date}T${startTime}\nDTEND:${date}T${endTime}\nSUMMARY:Kort Tenisowy\nEND:VEVENT\nEND:VCALENDAR`;
        const blob = new Blob([ics], { type: 'text/calendar' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = 'rezerwacja.ics'; a.click();
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
                        let content = `<div class="res-content"><div class="res-time">${range}</div><div class="res-user">${userText}</div>`;
                        if (isWorkshop) {
                            const taken = res.participants ? res.participants.length : 0;
                            content += `<div class="spots-left">Wolne: ${res.maxSpots - taken}</div>`;
                        }
                        content += `</div>`;
                        slotDiv.innerHTML = content;
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

// LOGIKA SZKOLEŃ
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
    if (!fName || !addr || pin.length < 4) return alert("Wypełnij pola i podaj PIN!");
    generateCalendarLinks([...selectedSlots]);
    for (let s of selectedSlots) {
        const data = { ...s, firstName: fName, address: addr, pin: pin };
        if (isWorkshop) { 
            data.type = "workshop"; 
            data.maxSpots = parseInt(document.getElementById("inputMaxSpots").value) || 4;
            data.donation = document.getElementById("inputDonation").value || 0;
            data.blik = document.getElementById("inputBlik").value.trim() || "---";
            data.coachNote = document.getElementById("inputCoachNote").value.trim() || "";
            data.coachName = document.getElementById("inputCoachDisplayName").value.trim() || "Trener";
            data.participants = []; 
        }
        await addDoc(reservationsCol, data);
    }
    localStorage.setItem('userPin', pin);
    selectedSlots = []; document.getElementById("bookingModal").classList.remove("active");
    document.getElementById("successPin").innerText = pin; document.getElementById("successModal").classList.add("active");
}

// KLUCZOWA FUNKCJA: ODŚWIEŻANIE TREŚCI MODALA
function refreshModalUI(res) {
    activeWorkshop = res;
    const taken = res.participants ? res.participants.length : 0;
    const savedPin = localStorage.getItem('userPin');

    document.getElementById("coachDashboardBtn").innerText = `Trener ${res.coachName || "..."}`;
    document.getElementById("workshopDescriptionText").innerText = res.address;
    document.getElementById("donationValue").innerText = `${res.donation || 0} zł`;
    document.getElementById("blikValue").innerText = res.blik || "---";
    document.getElementById("spotsLeftCount").innerText = res.maxSpots - taken;

    // AKTUALIZACJA NOTATKI (TUTAJ BYŁ PROBLEM)
    const noteBox = document.getElementById("coachNoteBox");
    if (res.coachNote && res.coachNote.trim() !== "") {
        noteBox.style.display = "block";
        document.getElementById("coachNoteText").innerText = res.coachNote;
    } else {
        noteBox.style.display = "none";
    }

    const listDiv = document.getElementById("participantsList");
    listDiv.innerHTML = (res.participants && res.participants.length > 0) 
        ? res.participants.map((p, i) => `<div class="participant-item"><div><strong>${p.name}</strong> (${p.age} l.), dom: ${p.address}</div><button class="leave-btn" onclick="removeParticipant(${i})">Wypisz</button></div>`).join("")
        : "<em style='color: #94a3b8;'>Brak zapisów.</em>";

    document.getElementById("joinForm").style.display = (savedPin === res.pin || savedPin === "9988") ? "none" : "block";
}

function openJoinWorkshop(res) {
    refreshModalUI(res);
    document.getElementById("joinWorkshopModal").classList.add("active");
}

window.removeParticipant = async (index) => {
    const p = activeWorkshop.participants[index];
    const inputPin = prompt(`Podaj PIN dziecka: ${p.name}`);
    if (inputPin === p.pin || inputPin === activeWorkshop.pin || inputPin === "9988") {
        if (!confirm("Wypisać dziecko?")) return;
        await updateDoc(doc(db, "reservations", activeWorkshop.id), { participants: arrayRemove(p) });
        alert("Wypisano.");
    } else if (inputPin !== null) alert("Błędny PIN!");
};

document.getElementById("confirmJoinBtn").onclick = async () => {
    const name = document.getElementById("joinName").value.trim();
    const age = document.getElementById("joinAge").value.trim();
    const addr = document.getElementById("joinAddress").value.trim();
    const pin = document.getElementById("joinPin").value.trim();
    if (!name || !age || !addr || pin.length < 4) return alert("Podaj dane i 4-cyfrowy PIN!");
    if (activeWorkshop.participants && activeWorkshop.participants.length >= activeWorkshop.maxSpots) return alert("Brak miejsc!");
    await updateDoc(doc(db, "reservations", activeWorkshop.id), { 
        participants: arrayUnion({ name, age, address: addr, pin, joinedAt: new Date().toISOString() }) 
    });
    generateCalendarLinks([{ date: activeWorkshop.date, time: activeWorkshop.time }]);
    localStorage.setItem('userPin', pin);
    document.getElementById("joinWorkshopModal").classList.remove("active");
    document.getElementById("successPin").innerText = pin;
    document.getElementById("successModal").classList.add("active");
};

// PANEL TRENERA
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
    const newNote = document.getElementById("editCoachNote").value.trim();
    await updateDoc(doc(db, "reservations", activeWorkshop.id), { coachNote: newNote });
    alert("Zaktualizowano komentarz!");
    document.getElementById("coachDashboardModal").classList.remove("active");
};

document.getElementById("coachCancelFullBtn").onclick = () => {
    if (confirm("NA PEWNO odwołać całe szkolenie i usunąć wszystkich zapisanych?")) {
        document.getElementById("coachDashboardModal").classList.remove("active");
        document.getElementById("joinWorkshopModal").classList.remove("active");
        cancelReservation(activeWorkshop, activeWorkshop.date, activeWorkshop.time);
    }
};

async function cancelReservation(res, date, time) {
    const block = findConnectedBlock(time, date, res.firstName, allReservations);
    for (let item of block) await deleteDoc(doc(db, "reservations", item.id));
}

// NASŁUCHIWANIE BAZY (DYNAMICZNE ODŚWIEŻANIE)
onSnapshot(reservationsCol, (snap) => {
    allReservations = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderCalendar();
    
    // Jeśli okno szczegółów jest otwarte, odświeżamy jego treść na żywo
    if (activeWorkshop) {
        const updatedRes = allReservations.find(r => r.id === activeWorkshop.id);
        if (updatedRes) {
            refreshModalUI(updatedRes);
        } else {
            // Jeśli szkolenie zostało usunięte w tle
            document.getElementById("joinWorkshopModal").classList.remove("active");
            activeWorkshop = null;
        }
    }
});

document.getElementById("confirmBookingBtn").onclick = confirmBooking;
document.getElementById("reserveBtn").onclick = () => document.getElementById("bookingModal").classList.add("active");
document.querySelectorAll(".cancel-modal-btn, .close-x").forEach(btn => {
    btn.onclick = () => document.querySelectorAll(".modal").forEach(m => m.classList.remove("active"));
});
document.getElementById("cancelJoinBtn").onclick = () => { document.getElementById("joinWorkshopModal").classList.remove("active"); activeWorkshop = null; };
document.getElementById("closeCoachDashBtn").onclick = () => document.getElementById("coachDashboardModal").classList.remove("active");
document.getElementById("closeSuccessBtn").onclick = () => document.getElementById("successModal").classList.remove("active");
document.getElementById("openBoardBtn").onclick = () => document.getElementById("partnerBoard").style.display = "block";
document.getElementById("closeBoardBtn").onclick = () => document.getElementById("partnerBoard").style.display = "none";

renderCalendar();