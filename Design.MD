# DESIGN.md — PopEngine Design System & UI Specifications

> Directly adapted from the architectural design language of Aura’s **Altitude MTL** template (monochrome palette, spatial coordinate tagging, clean typography hierarchy, and structured modular cards) for **PopEngine**'s NYC event intake and permitting engine.

---

## 1. Core Vision & Design Philosophy

PopEngine translates complex, multi-agency municipal permitting rules (DOHMH, Parks TUA, DOB, FDNY, SAPO) into an effortless, high-clarity intake flow.

* **Tone:** Architectural, precise, authoritative, and clean B2B SaaS.
* **Core Design Principles:**
  * **Architectural Surface Cards:** Form questions are grouped into clean, white visual cards with high-clarity border lines (`border-slate-200`) and ample breathing room.
  * **Spatial & Status Metadata Tagging:** Key fields display metadata chips (`BOROUGH: MANHATTAN`, `DOB SCOPE`, `STEP 01/03`) in monospace caps to mirror urban blueprints and spatial coordinates.
  * **High-Contrast Precision Palette:** Stark monochrome foundations (`slate-900` on `slate-50`) paired with subtle amber and emerald badges for live compliance status updates.

---

## 2. Color Palette & Utility System

### Base Surface & Text
* **Canvas Background:** `#F8FAFC` (`bg-slate-50`)
* **Card Surface:** `#FFFFFF` (`bg-white`)
* **Primary Headers / Active UI:** `#0F172A` (`bg-slate-900`, `text-slate-900`)
* **Muted Body Text:** `#475569` (`text-slate-600`)
* **Field Borders:** `#E2E8F0` (`border-slate-200`)
* **Hover / Focus Accent:** `#0F172A` (`border-slate-900`, `ring-slate-900`)

### Dynamic Permit Trigger Status Badges
* **Neutral Metadata Tag:** `bg-slate-100 text-slate-700 border-slate-300`
* **Triggered Permit Warning (Amber):** `bg-amber-50 text-amber-800 border-amber-200`
* **High-Compliance Flag (Rose):** `bg-rose-50 text-rose-800 border-rose-200`
* **Verified / Cleared State (Emerald):** `bg-emerald-50 text-emerald-800 border-emerald-200`

---

## 3. Typography Hierarchy

* **Primary Sans-Serif:** `Inter`, `-apple-system`, `sans-serif` (Headers, form field labels, body copy)
* **Metadata Monospace:** `JetBrains Mono`, `ui-monospace`, `monospace` (Step counters, agency scopes, headcount badges, coordinates)

| Role | Tailwind Classes | Usage Example |
| :--- | :--- | :--- |
| **System Tag** | `font-mono text-xs uppercase tracking-widest text-slate-500` | `40.7128° N / 74.0060° W` or `STEP 01/03` |
| **Main Header** | `text-2xl font-bold tracking-tight text-slate-900` | Section / Page title (`Describe your event`) |
| **Field Group Title** | `text-sm font-semibold text-slate-900 uppercase tracking-wider` | Card form header (`Structure types`) |
| **Form Label / Body** | `text-sm font-medium text-slate-700` | Radio/Checkbox options & input values |

---

## 4. UI Component Specifications

### 1. Architectural Form Card
```tsx
<div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
    <label className="text-sm font-semibold text-slate-900 uppercase tracking-wider">
      Structure types
    </label>
    <span className="text-xs font-mono text-slate-500 border border-slate-200 px-2 py-0.5 rounded bg-slate-50">
      DOB / FDNY SCOPE
    </span>
  </div>
  {/* Form fields go here */}
</div>
