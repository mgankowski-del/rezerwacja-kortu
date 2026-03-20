import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, deleteDoc, doc, getDocs, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// TWOJA KONFIGURACJA FIREBASE
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

// USTAWIENIA KALENDARZA
const START_HOUR = 6;
const END_HOUR = 23; // Ostatni slot kończy się o 23:00 (rezerwacja na 22:30)
let selectedSlots = [];
let allReservations = [];

// FUNKCJA: Obliczanie zakresu czasu (np. 10:00 - 11:30)
function getReservationRange(res, allRes) {
    const dayRes = allRes.filter(r => 
        r.date === res.date && 
        r.firstName === res.firstName && 
        r.address === res.address
    );

    dayRes.sort((a, b) => a.time.localeCompare(b.time));

    const startTime = dayRes[0].time;
    const lastSlotTime = dayRes[dayRes.length - 1].time;

    let [h, m] = lastSlotTime.split(':').map(Number);
    m += 30;
    if (m === 60) { h += 1; m = 0; }
    const endTime = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;

    return `${startTime} - ${endTime}`;
}

// RENDEROWANIE KALENDARZA
function renderCalendar() {
    const calendarEl = document.getElementById("calendar");
    if (!calendarEl) return;
    calendarEl.innerHTML = "";

    const days = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() + i);
        days.push(d);
    }

    days.forEach(day => {
        const dateStr = day.toISOString().split('T')[0];
        const dayCol = document.createElement("div");
        dayCol.className = "day-column";
        dayCol.innerHTML = `<div class="day-header">
            <strong>${day.toLocaleDateString('pl-PL', { weekday: 'short' })}</strong><br>
            <span>${day.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' })}</span>
        </div>`;

        for (let hour = START_HOUR; hour < END_HOUR; hour++) {
            for (let min of ["00", "30"]) {
                const timeStr = `${hour.toString().padStart(2, '0')}:${min}`;
                const fullIsoMatch = `${dateStr}T${timeStr}`; // Format ze screena: 2026-03-24T17:30
                
                const slotDiv = document.createElement("div");
                slotDiv.className = "time-slot";

                // SZUKANIE REZERWACJI (Obsługa starego i nowego formatu)
                const res = allReservations.find(r => {
                    // Nowy format
                    if (r.date === dateStr && r.time === timeStr) return true;
                    // Stary format (tablica bookedTimes)
                    if (r.bookedTimes && r.bookedTimes.includes(fullIsoMatch)) return true;
                    return false;
                });

                if (res) {
                    slotDiv.classList.add("booked");
                    // Wyświetlamy imię i nazwisko (stare rezerwacje mają surname)
                    const displayName = res.surname ? `${res.firstName} ${res.surname}` : res.firstName;
                    
                    // Dla starych rezerwacji pokazujemy tylko godzinę slotu, dla nowych zakres
                    let displayTime = timeStr;
                    if (r.date && r.time) {
                         displayTime = getReservationRange(res, allReservations);
                    }

                    slotDiv.innerHTML = `<strong>${displayTime}</strong><span>${displayName}, ${res.address}</span>`;
                    slotDiv.onclick = () => cancelReservation(res);
                } else {
                    slotDiv.innerText = timeStr;
                    if (selectedSlots.some(s => s.date === dateStr && s.time === timeStr)) {
                        slotDiv.classList.add("selected");
                    }
                    slotDiv.onclick = () => toggleSelectSlot(dateStr, timeStr);
                }
                dayCol.appendChild(slotDiv);
            }
        }
        calendarEl.appendChild(dayCol);
    });
}

// WYBÓR SLOTÓW
function toggleSelectSlot(date, time) {
    const index = selectedSlots.findIndex(s => s.date === date && s.time === time);
    if (index > -1) {
        selectedSlots.splice(index, 1);
    } else {
        if (selectedSlots.length >= 4) {
            alert("Maksymalnie 2 godziny (4 sloty)!");
            return;
        }
        selectedSlots.push({ date, time });
    }
    const reserveBtn = document.getElementById("reserveBtn");
    if (reserveBtn) reserveBtn.style.display = selectedSlots.length > 0 ? "block" : "none";
    renderCalendar();
}

// DODAWANIE REZERWACJI
async function confirmBooking() {
    const firstName = document.getElementById("inputFirstName").value;
    const address = document.getElementById("inputAddress").value;
    const pin = document.getElementById("inputPin").value;

    if (!firstName || !address || pin.length < 4) {
        alert("Wypełnij pola (PIN min. 4 cyfry)!");
        return;
    }

    for (let slot of selectedSlots) {
        await addDoc(reservationsCol, { ...slot, firstName, address, pin });
    }

    selectedSlots = [];
    document.getElementById("reserveBtn").style.display = "none";
    document.getElementById("bookingModal").classList.remove("active");
    document.getElementById("successPin").innerText = pin;
    document.getElementById("successModal").classList.add("active");
}

// ANULOWANIE REZERWACJI (USUNIĘCIE CAŁEGO BLOKU)
async function cancelReservation(res) {
    const pin = prompt(`Aby odwołać rezerwację dla ${res.firstName}, podaj PIN:`);
    if (pin === null) return;

    if (pin === res.pin || pin === "9988") {
        if (confirm("Czy chcesz usunąć całą tę rezerwację?")) {
            // Szukamy wszystkich slotów tej samej osoby w tym samym dniu
            const toDelete = allReservations.filter(r => 
                r.date === res.date && 
                r.firstName === res.firstName && 
                r.address === res.address
            );
            
            for (let item of toDelete) {
                await deleteDoc(doc(db, "reservations", item.id));
            }
        }
    } else {
        alert("Niepoprawny PIN!");
    }
}

// NASŁUCHIWANIE BAZY
onSnapshot(reservationsCol, (snapshot) => {
    allReservations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderCalendar();
});

// LISTENERY
document.getElementById("reserveBtn").onclick = () => document.getElementById("bookingModal").classList.add("active");
document.getElementById("cancelModalBtn").onclick = () => document.getElementById("bookingModal").classList.remove("active");
document.getElementById("confirmBookingBtn").onclick = confirmBooking;
document.getElementById("closeSuccessBtn").onclick = () => document.getElementById("successModal").classList.remove("active");

renderCalendar();