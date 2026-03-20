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

let allReservations = [];
let selectedSlots = [];

// POMOCNICZE
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
    return list.find(r => 
        (r.date === date && r.time === time) || 
        (r.bookedTimes && r.bookedTimes.includes(fullIso))
    );
}

// Znajduje ciągły blok rezerwacji
function findConnectedBlock(targetTime, targetDate, targetName, reservationsList) {
    const dayRes = reservationsList.filter(r => {
        const isSameUser = r.firstName === targetName;
        const isSameDate = r.date === targetDate || (r.bookedTimes && r.bookedTimes.some(t => t.startsWith(targetDate)));
        return isSameUser && isSameDate;
    });

    let block = [];
    const startRes = findReservationAt(targetDate, targetTime, dayRes);
    if (!startRes) return [];

    block.push(startRes);
    let foundNew = true;
    while (foundNew) {
        foundNew = false;
        for (let r of dayRes) {
            if (block.includes(r)) continue;
            const isNeighbor = block.some(b => {
                // Dla starych rezerwacji z tablicą bookedTimes sprawdzamy sąsiedztwo z dowolnym elementem tablicy
                if (r.bookedTimes) {
                    return r.bookedTimes.some(t => {
                        const [d, time] = t.split('T');
                        return getNextTime(b.time) === time || getPrevTime(b.time) === time;
                    });
                }
                return getNextTime(b.time) === r.time || getPrevTime(b.time) === r.time;
            });
            if (isNeighbor) {
                block.push(r);
                foundNew = true;
            }
        }
    }
    return block;
}

function getReservationRange(res, allRes, dateStr) {
    if (res.bookedTimes) {
        const times = res.bookedTimes.map(t => t.split('T')[1]).sort();
        const start = times[0];
        const last = times[times.length - 1];
        let [h, m] = last.split(':').map(Number);
        m += 30; if (m === 60) { h += 1; m = 0; }
        return `${start}-${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    }
    const block = findConnectedBlock(res.time, dateStr, res.firstName, allRes);
    block.sort((a, b) => a.time.localeCompare(b.time));
    const start = block[0].time;
    const last = block[block.length - 1].time;
    let [h, m] = last.split(':').map(Number);
    m += 30; if (m === 60) { h += 1; m = 0; }
    return `${start}-${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
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
                    const isCont = prevRes && prevRes.firstName === res.firstName;
                    
                    if (isCont) slotDiv.classList.add("is-continuation");
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
    if (idx > -1) {
        selectedSlots.splice(idx, 1);
    } else {
        // Robimy "wirtualne" sprawdzenie przed dodaniem, czy nie tworzymy bloku > 2h
        const fName = document.getElementById("inputFirstName").value.trim() || "Użytkownik";
        const virtualAll = [...allReservations, ...selectedSlots.map(s => ({...s, firstName: fName})), {date, time, firstName: fName}];
        
        const block = findConnectedBlock(time, date, fName, virtualAll);
        if (block.length > 4) {
            return alert("Pojedynczy blok rezerwacji bez przerwy nie może przekraczać 2 godzin!");
        }
        
        selectedSlots.push({ date, time });
    }
    document.getElementById("reserveBtn").style.display = selectedSlots.length > 0 ? "block" : "none";
    renderCalendar();
}

async function confirmBooking() {
    const fName = document.getElementById("inputFirstName").value.trim();
    const addr = document.getElementById("inputAddress").value.trim();
    const pin = document.getElementById("inputPin").value;
    
    if (!fName || !addr || pin.length < 4) return alert("Wypełnij wszystkie dane!");

    localStorage.setItem('userPin', pin);
    
    for (let s of selectedSlots) {
        await addDoc(reservationsCol, { ...s, firstName: fName, address: addr, pin: pin });
    }
    
    selectedSlots = [];
    document.getElementById("bookingModal").classList.remove("active");
    document.getElementById("successPin").innerText = pin;
    document.getElementById("successModal").classList.add("active");
}

async function cancelReservation(res, date, time) {
    let savedPin = localStorage.getItem('userPin');
    let shouldDelete = false;

    if (savedPin === res.pin || savedPin === "9988") {
        if (confirm(`Czy usunąć rezerwację ${getReservationRange(res, allReservations, date)}?`)) shouldDelete = true;
    } else {
        let inputPin = prompt(`Podaj PIN dla ${res.firstName}:`);
        if (inputPin === res.pin || inputPin === "9988") shouldDelete = true;
        else if (inputPin !== null) alert("Błędny PIN!");
    }

    if (shouldDelete) {
        const blockToDel = findConnectedBlock(time, date, res.firstName, allReservations);
        for (let item of blockToDel) await deleteDoc(doc(db, "reservations", item.id));
    }
}

onSnapshot(reservationsCol, (snap) => {
    allReservations = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderCalendar();
});

document.getElementById("confirmBookingBtn").onclick = confirmBooking;
document.getElementById("reserveBtn").onclick = () => document.getElementById("bookingModal").classList.add("active");
document.getElementById("cancelModalBtn").onclick = () => document.getElementById("bookingModal").classList.remove("active");
document.getElementById("closeSuccessBtn").onclick = () => document.getElementById("successModal").classList.remove("active");

renderCalendar();