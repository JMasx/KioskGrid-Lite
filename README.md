# Grid Kiosk

A lightweight, grid-based kiosk interface designed for extremely low-end Android devices, specifically targeting what I had laying around, an **Android 4.0 (Ice Cream Sandwich)** running on the **Amazon Kindle Fire HD 8.9" 2nd Gen (2012)**.

This project is a very ambitious experiment in building a somewhat **modern-feeling home automation dashboard under VERY archaic browser constraints**.

---

## The Goal

Turning extremely outdated tablets into somewhat functional, mostly on **Home Assistant wall panels**, using:

- Pure static HTML/CSS/JS
- Local network communication with Home Assistant

In my eyes the main focus was **performance over abstraction**.

There were some projects i wished i was able to run, notably [Fully-Kiosk](https://www.fully-kiosk.com/), there were also projects that were beautiful but did too little for my wants, i.e. only were a statistics display and not very interactive like [WallPanel](https://github.com/WallPanel-Project/wallpanel-android)

---

## My Target Hardware

- Amazon Kindle Fire HD 8.9" (2nd Gen, 2012)
- Fire OS 2 (Android 4.0.3 / API 15)
- Extremely limited WebView (pre-modern TLS + ES5-only JS support)
- No modern app support (no Play Store ecosystem)

---

## Some Design Constraints

In this project explicitly I've avoided modern web tooling altogether:

- No ES6+ JavaScript ( :/ )
- No WebSockets (for compatibility purposes, who would've guessed a proprietary software locked Tab-like device from 2012 would have compatibility issues) 
- No Build tools (Webpack, Vite, etc.)
- Absolutely no Frameworks (React, Vue, Svelte, etc.) (life is so nice with frameworks)
- Obviously no large DOM abstractions either

INSTEAD, I used:

- Rudimentary ES5-compatible JavaScript
- Some good old XMLHttpRequest for APIs calls
- Required localStorage for persistence
- Lots and lots of static HTML rendering
- Grid layout engine (TY to [Muuri](https://github.com/haltu/muuri) for this )

---

## You may have questions on the Architecture

What is Architecture?
