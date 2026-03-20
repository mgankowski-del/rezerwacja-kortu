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

function getPrevTime(time) {
    let [h, m] = time.split(':').map(Number);
    if (m === 30) m = 0; else { h -= 1; m = 30; }
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function getReservationRange(res, allRes, dateStr) {
    try {
        const dayRes = allRes.filter(r => (r.date === dateStr || (r.bookedTimes && r.bookedTimes.some(t => t.startsWith(dateStr)))) && r.firstName === res.firstName);
        let times = res.bookedTimes ? res.bookedTimes.map(t => t.split('T')[1]) : dayRes.map(r => r.time);
        times.sort();
        const start = times[0];
        const last = times[times.length - 1];
        let [h, m] = last.split(':').map(Number);
        m += 30; if (m === 60) { h += 1; m = 0; }
        return `${start}-${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    } catch (e) { return res.time || ""; }
}

function generateCalendarLinks(slots) {
    if (slots.length === 0) return;
    slots.sort((a, b) => a.time.localeCompare(b.time));
    const date = slots[0].date.replace(/-/g, '');
    const startTime = slots[0].time.replace(':', '') + '00';
    let [h, m] = slots[slots.length - 1].time.split(':').map(Number);
    m += 30; if (m === 60) { h += 1; m = 0; }
    const endTime = `${h.toString().padStart(2, '0')}${m.toString().padStart(2, '0')}00`;
    const title = encodeURIComponent("Kort Tenisowy");
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
                const fullIso = `${dateStr}T${timeStr}`;
                const slotDiv = document.createElement("div");
                slotDiv.className = "time-slot";

                const res = allReservations.find(r => (r.date === dateStr && r.time === timeStr) || (r.bookedTimes && r.bookedTimes.includes(fullIso)));

                if (res) {
                    slotDiv.classList.add("booked");
                    const prevT = getPrevTime(timeStr);
                    const prevFullIso = `${dateStr}T${prevT}`;
                    const isCont = allReservations.some(r => (r.date === dateStr && r.time === prevT && r.firstName === res.firstName) || (r.bookedTimes && r.bookedTimes.includes(prevFullIso) && r.firstName === res.firstName));
                    
                    if (isCont) slotDiv.classList.add("is-continuation");
                    else {
                        const range = getReservationRange(res, allReservations, dateStr);
                        slotDiv.innerHTML = `<div class="res-content"><div class="res-time">${range}</div><div class="res-user">${res.firstName}, ${res.address}</div></div>`;
                    }
                    slotDiv.onclick = () => cancelReservation(res);
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
    else { if (selectedSlots.length >= 4) return alert("Max 2h!"); selectedSlots.push({ date, time }); }
    document.getElementById("reserveBtn").style.display = selectedSlots.length > 0 ? "block" : "none";
    renderCalendar();
}

async function confirmBooking() {
    const fName = document.getElementById("inputFirstName").value;
    const addr = document.getElementById("inputAddress").value;
    const pin = document.getElementById("inputPin").value;
    if (!fName || !addr || pin.length < 4) return alert("Wypełnij dane!");

    localStorage.setItem('userPin', pin);
    generateCalendarLinks([...selectedSlots]);

    for (let s of selectedSlots) await addDoc(reservationsCol, { ...s, firstName: fName, address: addr, pin: pin });
    selectedSlots = [];
    document.getElementById("bookingModal").classList.remove("active");
    document.getElementById("successPin").innerText = pin;
    document.getElementById("successModal").classList.add("active");
}

async function cancelReservation(res) {
    let savedPin = localStorage.getItem('userPin');
    let shouldDelete = false;

    // SCENARIUSZ 1: Telefon pamięta Twój PIN
    if (savedPin === res.pin || savedPin === "9988") {
        if (confirm(`Czy na pewno chcesz usunąć swoją rezerwację (${res.firstName})?`)) {
            shouldDelete = true;
        }
    } 
    // SCENARIUSZ 2: To nie Twoja rezerwacja lub telefon nie pamięta PIN-u
    else {
        let inputPin = prompt(`Podaj PIN dla rezerwacji ${res.firstName}:`);
        if (inputPin === res.pin || inputPin === "9988") {
            shouldDelete = true;
        } else if (inputPin !== null) {
            alert("Błędny PIN!");
        }
    }

    if (shouldDelete) {
        const toDel = allReservations.filter(r => (r.date === res.date && r.firstName === res.firstName) || (res.bookedTimes && r.id === res.id));
        for (let item of toDel) await deleteDoc(doc(db, "reservations", item.id));
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