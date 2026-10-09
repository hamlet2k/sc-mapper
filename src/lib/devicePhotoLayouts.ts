// Photo layouts of the device-specific built-in templates: which product photos (public/device-photos/<photo>.webp, cut out by
// scripts/device-photos/cutout.py, sizes in devicePhotoSizes.ts) a template shows, and where each of its controls is on them.
//
// A template whose id has an entry here uses the photos (views side by side, a marker on each control, labels laid out next to
// the photo); every other device template keeps its procedural art (src/lib/deviceArt). An entry is only used when it places
// EVERY control of the template (the control ids are the callout ids in deviceTemplates.ts, e.g. 'trig', 'tms', 'xy'); an
// incomplete entry is ignored (and reported by the unit tests), so the art never loses a callout.
//
// Coordinates: x, y = fractions (0..1) of the whole photo file (width / height of the .webp, glow padding included), measured
// on the photo itself: x from the left edge, y from the top edge. `view` = the `id` of one of the entry's views.
//
// Format:
//   'builtin-tm-warthog-stick': {
//     views: [{ id: 'thumb', label: 'Thumb side', photo: 'tm-warthog-stick-thumb' }, { id: 'side', label: 'Right side', photo: 'tm-warthog-stick-side' }],
//     anchors: { trig: { view: 'thumb', x: 0.41, y: 0.52 }, tms: { view: 'thumb', x: 0.47, y: 0.18 }, ... },
//   },

export interface PhotoLayoutView {
  /** view id (unique within the entry; referenced by the anchors) */
  id: string;
  /** tab / caption, e.g. 'Front', 'Thumb side' */
  label: string;
  /** photo file name without extension: public/device-photos/<photo>.webp (a key of DEVICE_PHOTO_SIZES) */
  photo: string;
  /** alternatives (e.g. interchangeable grips): views with the same key show one at a time (TemplateView.swap) */
  swap?: string;
}
export interface PhotoAnchor {
  view: string;
  /** 0..1 of the photo width, from the left */
  x: number;
  /** 0..1 of the photo height, from the top */
  y: number;
  /** label column to put this control's box in (default: by position) */
  side?: 'L' | 'R';
}
export interface DevicePhotoLayout {
  views: PhotoLayoutView[];
  /** control id (callout id of the template) -> where it is on which photo */
  anchors: Record<string, PhotoAnchor>;
}

// Photo layouts (measured on the photos with grid overlays; controls hidden on every photo are placed at their best estimated spot).
// Done: Thrustmaster HOTAS Warthog stick + throttle, T.16000M, TWCS, MOZA AB6 + MHG, VKB Gladiator SCG, VKB Gunfighter MCG, VIRPIL Alpha Prime, WinCtrl CarrierAce / ViperAce / Orion throttle / Orion pedals / URSA / CarrierAce MFD L+PTO 2+UFC+HUD, Azeron keypad, Logitech X56 stick + throttle, VKB STECS, MOZA MTP, MOZA MTQ, VIRPIL VMAX Prime, WinCtrl Orion (F-15EX), WinCtrl URSA MINOR Combat (measured with grid overlays, grips per the WinCtrl grip maps). All device templates now have a photo layout.
// Thrustmaster HOTAS Warthog: measured on the photos with grid overlays (see the Thrustmaster manual for the control names).
export const DEVICE_PHOTO_LAYOUTS: Record<string, DevicePhotoLayout> = {
  'builtin-tm-warthog-stick': {
    views: [{ id: 'thumb', label: 'Thumb side', photo: 'tm-warthog-stick-thumb' }, { id: 'side', label: 'Left side', photo: 'tm-warthog-stick-side' }],
    anchors: {
      wpn: { view: 'thumb', x: 0.412, y: 0.073 },
      trim: { view: 'thumb', x: 0.474, y: 0.074 },
      tms: { view: 'thumb', x: 0.426, y: 0.136 },
      dms: { view: 'thumb', x: 0.49, y: 0.143 },
      trig: { view: 'side', x: 0.405, y: 0.245 },
      cms: { view: 'side', x: 0.5, y: 0.245 },
      mmode: { view: 'side', x: 0.477, y: 0.2 },
      pinky: { view: 'side', x: 0.4, y: 0.44 },
      nws: { view: 'side', x: 0.485, y: 0.445 },
      xy: { view: 'side', x: 0.53, y: 0.63 },
    },
  },
  // builtin-tm-warthog-throttle: exact callouts via photoTplExactViews (Federico's export) — not listed here.
  // Thrustmaster T.16000M FCS: one photo (left-front view); rpanel (right base panel) is on the far side, hidden behind the shaft: estimated.
  'builtin-tm-t16000m': {
    views: [{ id: 'main', label: 'Front', photo: 'tm-t16000m-main' }],
    anchors: {
      pov: { view: 'main', x: 0.45, y: 0.075 },
      b2: { view: 'main', x: 0.505, y: 0.165 },
      b3: { view: 'main', x: 0.47, y: 0.13 },
      b4: { view: 'main', x: 0.38, y: 0.115 },
      trig: { view: 'main', x: 0.3, y: 0.17 },
      twist: { view: 'main', x: 0.46, y: 0.35 },
      xy: { view: 'main', x: 0.5, y: 0.52 },
      lpanel: { view: 'main', x: 0.2, y: 0.74 },
      rpanel: { view: 'main', x: 0.35, y: 0.585 },
      thr: { view: 'main', x: 0.84, y: 0.735 },
    },
  },
  // Thrustmaster TWCS: h11 estimated (no clear second 4-way hat on the photos); r45 / h7 assignment to the thumb-side stack uncertain.
  'builtin-tm-twcs': {
    views: [{ id: 'thumb', label: 'Thumb side', photo: 'tm-twcs-thumb' }, { id: 'front', label: 'Front', photo: 'tm-twcs-front' }],
    anchors: {
      pov: { view: 'thumb', x: 0.6, y: 0.155 },
      r45: { view: 'thumb', x: 0.59, y: 0.27 },
      h7: { view: 'thumb', x: 0.585, y: 0.38 },
      b1: { view: 'thumb', x: 0.535, y: 0.47 },
      thr: { view: 'thumb', x: 0.38, y: 0.25 },
      mini: { view: 'front', x: 0.505, y: 0.235 },
      minib: { view: 'front', x: 0.505, y: 0.25 },
      ant: { view: 'front', x: 0.545, y: 0.22 },
      b2: { view: 'front', x: 0.575, y: 0.2 },
      b3: { view: 'front', x: 0.615, y: 0.195 },
      h11: { view: 'front', x: 0.415, y: 0.255 },
      paddle: { view: 'front', x: 0.48, y: 0.32 },
    },
  },
  // builtin-moza-ab6: exact callouts via photoTplExactViews (Federico's export) — not listed here.
  // builtin-honeycomb-bravo: exact callouts via photoTplExact (researched DI + invented spots) — not listed here.
  // VKB Gladiator NXT EVO SCG: head hats by position (uncertain); d1 (pinky) and en1 (right-side encoder) estimated.
  'builtin-vkb-gladiator-scg': {
    views: [{ id: 'thumb', label: 'Thumb side', photo: 'vkb-gladiator-scg-thumb' }, { id: 'front', label: 'Right side', photo: 'vkb-gladiator-scg-front' }],
    anchors: {
      a4: { view: 'thumb', x: 0.56, y: 0.113 },
      a1: { view: 'thumb', x: 0.659, y: 0.113 },
      a1x: { view: 'thumb', x: 0.665, y: 0.122 },
      a3: { view: 'thumb', x: 0.6, y: 0.165 },
      a2: { view: 'thumb', x: 0.535, y: 0.181 },
      c1: { view: 'thumb', x: 0.46, y: 0.305 },
      rf: { view: 'thumb', x: 0.825, y: 0.19 },
      fkeys: { view: 'thumb', x: 0.334, y: 0.68 },
      sw1: { view: 'thumb', x: 0.203, y: 0.736 },
      thr: { view: 'thumb', x: 0.272, y: 0.772 },
      twist: { view: 'thumb', x: 0.52, y: 0.45 },
      xy: { view: 'thumb', x: 0.525, y: 0.633 },
      trig: { view: 'front', x: 0.41, y: 0.335 },
      d1: { view: 'front', x: 0.48, y: 0.47 },
      b1: { view: 'front', x: 0.449, y: 0.18 },
      en1: { view: 'front', x: 0.5, y: 0.835 },
    },
  },
  // VKB Gunfighter Mk.IV + MCG Ultimate: names/positions per the UntoldForce MCGU map (same front photo); MANVR = hat under the head, DC = right-side hat (hidden on the front photo, PDF leader), flip = black lever below the red trigger; brake lever (analog) shares the lever.
  'builtin-vkb-gunfighter-mcg': {
    views: [{ id: 'front', label: 'Front', photo: 'vkb-gunfighter-mcg-front' }, { id: 'thumb', label: 'Right side', photo: 'vkb-gunfighter-mcg-thumb' }],
    anchors: {
      apoff: { view: 'front', x: 0.37, y: 0.075 },
      mmode: { view: 'front', x: 0.431, y: 0.07 },
      gc: { view: 'front', x: 0.387, y: 0.147 },
      gca: { view: 'front', x: 0.393, y: 0.156 },
      manvr: { view: 'front', x: 0.47, y: 0.165 },
      trig: { view: 'front', x: 0.398, y: 0.27 },
      flip: { view: 'front', x: 0.387, y: 0.303 },
      reset: { view: 'front', x: 0.453, y: 0.281 },
      ring: { view: 'front', x: 0.47, y: 0.378 },
      brake: { view: 'front', x: 0.353, y: 0.435 },
      brakea: { view: 'front', x: 0.36, y: 0.445 },
      xy: { view: 'front', x: 0.514, y: 0.65 },
      lvl: { view: 'thumb', x: 0.57, y: 0.065 },
      gun: { view: 'thumb', x: 0.555, y: 0.15 },
      dc: { view: 'thumb', x: 0.7, y: 0.21 },
    },
  },
  // VIRPIL Alpha Prime R: matched to the VIRPIL button map; the 'front' photo is the rear view. Lower trigger t4 estimated (hidden behind the trigger).
  'builtin-virpil-alpha-prime': {
    views: [{ id: 'back', label: 'Thumb side', photo: 'virpil-alpha-prime-back' }, { id: 'front', label: 'Rear', photo: 'virpil-alpha-prime-front' }],
    anchors: {
      mini: { view: 'back', x: 0.24, y: 0.159 },
      minib: { view: 'back', x: 0.246, y: 0.167 },
      b7: { view: 'back', x: 0.465, y: 0.117 },
      h8: { view: 'back', x: 0.58, y: 0.123 },
      h14: { view: 'back', x: 0.39, y: 0.2 },
      b13: { view: 'back', x: 0.56, y: 0.222 },
      r28: { view: 'back', x: 0.87, y: 0.245 },
      l19: { view: 'back', x: 0.42, y: 0.3 },
      t1: { view: 'back', x: 0.66, y: 0.38 },
      t4: { view: 'back', x: 0.64, y: 0.425 },
      brake: { view: 'back', x: 0.61, y: 0.57 },
      braked: { view: 'back', x: 0.617, y: 0.58 },
      twist: { view: 'back', x: 0.31, y: 0.9 },
      xy: { view: 'front', x: 0.7, y: 0.8 },
      h23: { view: 'front', x: 0.81, y: 0.43 },
      b31: { view: 'front', x: 0.74, y: 0.67 },
    },
  },
  // WinCtrl CarrierAce (F/A-18): matched to the WinCtrl diagram; the 'front' photo looks at the rear (castle hat A facing). Rear button = dot above the collar (uncertain).
  'builtin-winctrl-carrierace': {
    views: [{ id: 'front', label: 'Rear', photo: 'winctrl-carrierace-front' }, { id: 'side', label: 'Thumb side', photo: 'winctrl-carrierace-side' }],
    anchors: {
      wpn: { view: 'front', x: 0.216, y: 0.242 },
      hatC: { view: 'front', x: 0.351, y: 0.166 },
      trim: { view: 'front', x: 0.506, y: 0.116 },
      hatB: { view: 'front', x: 0.475, y: 0.224 },
      sel5: { view: 'front', x: 0.423, y: 0.281 },
      hatA: { view: 'front', x: 0.413, y: 0.46 },
      rear: { view: 'front', x: 0.579, y: 0.726 },
      xy: { view: 'front', x: 0.558, y: 0.834 },
      trig: { view: 'side', x: 0.665, y: 0.367 },
      paddle: { view: 'side', x: 0.64, y: 0.66 },
      paddlea: { view: 'side', x: 0.647, y: 0.67 },
    },
  },
  // WinCtrl ViperAce (F-16 + side module): matched to the WinCtrl diagram (every control of the grip + side module; the WinCtrl base has no twist and no base buttons).
  'builtin-winctrl-viperace': {
    views: [{ id: 'head', label: 'Grip head', photo: 'winctrl-viperace-head' }, { id: 'side', label: 'Side module', photo: 'winctrl-viperace-side' }],
    anchors: {
      trim: { view: 'head', x: 0.545, y: 0.111 },
      wpn: { view: 'head', x: 0.404, y: 0.165 },
      cms: { view: 'head', x: 0.31, y: 0.21 },
      mini: { view: 'head', x: 0.357, y: 0.336 },
      minib: { view: 'head', x: 0.363, y: 0.344 },
      dms: { view: 'side', x: 0.641, y: 0.488 },
      hatD: { view: 'head', x: 0.462, y: 0.26 },
      hatE: { view: 'head', x: 0.603, y: 0.219 },
      nws: { view: 'head', x: 0.474, y: 0.686 },
      xy: { view: 'head', x: 0.744, y: 0.785 },
      tms: { view: 'head', x: 0.462, y: 0.47 },
      trig: { view: 'side', x: 0.573, y: 0.506 },
      wheel: { view: 'side', x: 0.8, y: 0.551 },
      wheela: { view: 'side', x: 0.806, y: 0.56 },
      paddle: { view: 'side', x: 0.687, y: 0.749 },
      paddlea: { view: 'side', x: 0.693, y: 0.758 },
    },
  },
  // Logitech X56 stick: one photo (thumb side, front facing left). Buttons B and C (head front / side) and D (pinkie button) are not visible on the photo: estimated; twist marker on the grip.
  'builtin-logitech-x56-stick': {
    views: [{ id: 'main', label: 'Thumb side', photo: 'logitech-x56-stick-main' }],
    anchors: {
      pov: { view: 'main', x: 0.37, y: 0.12 },
      a: { view: 'main', x: 0.395, y: 0.075 },
      h1: { view: 'main', x: 0.47, y: 0.075 },
      h2: { view: 'main', x: 0.51, y: 0.135 },
      b: { view: 'main', x: 0.315, y: 0.14 },
      c: { view: 'main', x: 0.43, y: 0.16 },
      mini: { view: 'main', x: 0.35, y: 0.295 },
      trig: { view: 'main', x: 0.395, y: 0.25 },
      d: { view: 'main', x: 0.375, y: 0.36 },
      fp: { view: 'main', x: 0.345, y: 0.41 },
      twist: { view: 'main', x: 0.5, y: 0.4 },
      xy: { view: 'main', x: 0.46, y: 0.62 },
    },
  },
  // Logitech X56 throttle: one photo (front-right). Hat 1 / Hat 2 = upper / lower thumb hat; the left-grip button is on the far side (estimated).
  'builtin-logitech-x56-throttle': {
    views: [{ id: 'main', label: 'Front', photo: 'logitech-x56-throttle-main' }],
    anchors: {
      rty1: { view: 'main', x: 0.728, y: 0.09 },
      rty2: { view: 'main', x: 0.74, y: 0.29 },
      slider: { view: 'main', x: 0.65, y: 0.235 },
      thumb: { view: 'main', x: 0.6, y: 0.345 },
      hat1: { view: 'main', x: 0.675, y: 0.355 },
      hat2: { view: 'main', x: 0.665, y: 0.4 },
      mini: { view: 'main', x: 0.575, y: 0.39 },
      mode: { view: 'main', x: 0.133, y: 0.509 },
      sw: { view: 'main', x: 0.344, y: 0.607 },
      tgl: { view: 'main', x: 0.8, y: 0.49 },
      rty3: { view: 'main', x: 0.554, y: 0.568 },
      rty4: { view: 'main', x: 0.647, y: 0.568 },
      lthr: { view: 'main', x: 0.428, y: 0.205 },
      rthr: { view: 'main', x: 0.62, y: 0.18 },
      lbtn: { view: 'main', x: 0.335, y: 0.3 },
    },
  },
  // VKB STECS Mk.II + STEM: names per the UntoldForce maps. 'front' = thumb side, 'stem' = STEM module (same photo), 'back' = grip front + base. Aft triggers, ring-finger encoder, forward trigger L and the STEM toggle / gear lever / lever / encoders are hidden or ambiguous: estimated; STEM rocker / button mapping uncertain.
  'builtin-vkb-stecs': {
    views: [{ id: 'front', label: 'Thumb side', photo: 'vkb-stecs-front' }, { id: 'stem', label: 'STEM module', photo: 'vkb-stecs-front' }, { id: 'back', label: 'Grip front + base', photo: 'vkb-stecs-back' }],
    anchors: {
      ots: { view: 'front', x: 0.764, y: 0.143 },
      otsb: { view: 'front', x: 0.77, y: 0.152 },
      radio: { view: 'front', x: 0.672, y: 0.187 },
      brk: { view: 'front', x: 0.73, y: 0.237 },
      opex: { view: 'front', x: 0.69, y: 0.323 },
      sw1: { view: 'stem', x: 0.2, y: 0.585 },
      sw2: { view: 'stem', x: 0.325, y: 0.56 },
      c1: { view: 'stem', x: 0.225, y: 0.68 },
      a12: { view: 'stem', x: 0.29, y: 0.655 },
      b15: { view: 'stem', x: 0.43, y: 0.66 },
      en1: { view: 'stem', x: 0.13, y: 0.615 },
      en2: { view: 'stem', x: 0.12, y: 0.655 },
      tgl: { view: 'stem', x: 0.09, y: 0.625 },
      gear: { view: 'stem', x: 0.075, y: 0.675 },
      mlev: { view: 'stem', x: 0.08, y: 0.69 },
      senc: { view: 'back', x: 0.762, y: 0.168 },
      rew: { view: 'back', x: 0.762, y: 0.248 },
      renc: { view: 'back', x: 0.705, y: 0.207 },
      mb2: { view: 'back', x: 0.634, y: 0.252 },
      mb1: { view: 'back', x: 0.655, y: 0.326 },
      fwdr: { view: 'back', x: 0.73, y: 0.335 },
      fwdl: { view: 'back', x: 0.72, y: 0.35 },
      aftl: { view: 'back', x: 0.4, y: 0.26 },
      aftr: { view: 'back', x: 0.4, y: 0.29 },
      start: { view: 'back', x: 0.494, y: 0.606 },
      sys: { view: 'back', x: 0.559, y: 0.682 },
      mode: { view: 'back', x: 0.43, y: 0.563 },
      mtgl: { view: 'back', x: 0.52, y: 0.17 },
      mtgr: { view: 'back', x: 0.66, y: 0.14 },
    },
  },
  // MOZA MTP: matched to the MOZA diagram (same photo three times: front / rear panel controls and grip + levers, too many labels for one view) (panel labels readable on the photo). L GEN / R GEN / switch 24 / switch 33 are hidden under the grip (estimated); grip buttons 3 / 4, switch 5, hat 70, slide and button 19 assigned by position (uncertain); levers marked on the lever stems.
  'builtin-moza-mtp': {
    views: [{ id: 'panel', label: 'Panel (front)', photo: 'moza-mtp-main' }, { id: 'panel2', label: 'Panel (rear)', photo: 'moza-mtp-main' }, { id: 'grip', label: 'Grip and levers', photo: 'moza-mtp-main' }],
    anchors: {
      crank: { view: 'panel', x: 0.125, y: 0.51 },
      apu: { view: 'panel', x: 0.176, y: 0.468 },
      strobe: { view: 'panel', x: 0.213, y: 0.552 },
      intr: { view: 'panel', x: 0.236, y: 0.586 },
      pos: { view: 'panel', x: 0.288, y: 0.506 },
      form: { view: 'panel', x: 0.379, y: 0.487 },
      rtrim: { view: 'panel', x: 0.327, y: 0.61 },
      reset: { view: 'panel', x: 0.395, y: 0.69 },
      rzs: { view: 'panel', x: 0.437, y: 0.724 },
      probe: { view: 'panel', x: 0.275, y: 0.425 },
      rot4: { view: 'panel2', x: 0.385, y: 0.372 },
      rot8: { view: 'panel2', x: 0.463, y: 0.418 },
      s29: { view: 'panel2', x: 0.457, y: 0.337 },
      s31: { view: 'panel2', x: 0.502, y: 0.35 },
      s33: { view: 'panel2', x: 0.535, y: 0.37 },
      lgen: { view: 'panel2', x: 0.5, y: 0.3 },
      s24: { view: 'panel2', x: 0.535, y: 0.315 },
      rgen: { view: 'panel2', x: 0.57, y: 0.335 },
      light: { view: 'panel2', x: 0.77, y: 0.41 },
      lthr: { view: 'grip', x: 0.525, y: 0.48 },
      rthr: { view: 'grip', x: 0.555, y: 0.46 },
      mini: { view: 'grip', x: 0.67, y: 0.375 },
      minib: { view: 'grip', x: 0.676, y: 0.385 },
      s69: { view: 'grip', x: 0.7, y: 0.287 },
      b3: { view: 'grip', x: 0.73, y: 0.178 },
      b4: { view: 'grip', x: 0.776, y: 0.131 },
      s5: { view: 'grip', x: 0.75, y: 0.22 },
      h11: { view: 'grip', x: 0.718, y: 0.307 },
      h70: { view: 'grip', x: 0.74, y: 0.26 },
      slide: { view: 'grip', x: 0.65, y: 0.32 },
      b19: { view: 'grip', x: 0.63, y: 0.3 },
    },
  },
  // Batch 4 (densest): measured with grid overlays; hidden controls placed at their best estimated spot (see the notes).
  // The third photo swaps with the grip in use (swap 'Grip'): combat grip (default), Airbus or Boeing modules (MOZA product shots,
  // seen from the front: the right module is on the left of the photo). Airbus 67 and Boeing 72 (left module end caps) face away
  // from the camera: estimated at the bar ends.
  'builtin-moza-mtq': {
    views: [
      { id: 'levers', label: 'Levers and grip', photo: 'moza-mtq-front' }, { id: 'panel', label: 'Panel', photo: 'moza-mtq-front' },
      { id: 'combat', label: 'Combat grip (rear)', photo: 'moza-mtq-side', swap: 'Grip' },
      { id: 'airbus', label: 'Airbus grips (front)', photo: 'moza-mtq-airbus', swap: 'Grip' },
      { id: 'boeing', label: 'Boeing grips (front)', photo: 'moza-mtq-boeing', swap: 'Grip' },
    ],
    anchors: {
      spbrk: { view: 'levers', x: 0.44, y: 0.34 },
      spbrkb: { view: 'levers', x: 0.41, y: 0.48 },
      lthr: { view: 'levers', x: 0.57, y: 0.42 },
      lthrb: { view: 'levers', x: 0.49, y: 0.5 },
      rthr: { view: 'levers', x: 0.65, y: 0.4 },
      rthrb: { view: 'levers', x: 0.62, y: 0.52 },
      flaps: { view: 'levers', x: 0.8, y: 0.43 },
      flapsb: { view: 'levers', x: 0.75, y: 0.55 },
      h56: { view: 'levers', x: 0.936, y: 0.111 },
      h61: { view: 'levers', x: 0.863, y: 0.26 },
      slide: { view: 'levers', x: 0.873, y: 0.174 },
      a14: { view: 'panel', x: 0.2, y: 0.61 },
      k510: { view: 'panel', x: 0.32, y: 0.645 },
      enc1: { view: 'panel', x: 0.528, y: 0.607 },
      enc2: { view: 'panel', x: 0.464, y: 0.635 },
      rot5: { view: 'panel', x: 0.625, y: 0.615 },
      s3: { view: 'panel', x: 0.557, y: 0.7 },
      t25: { view: 'panel', x: 0.36, y: 0.707 },
      t27: { view: 'panel', x: 0.424, y: 0.72 },
      t29: { view: 'panel', x: 0.487, y: 0.718 },
      mini: { view: 'combat', x: 0.535, y: 0.207 },
      minib: { view: 'combat', x: 0.545, y: 0.22 },
      b65: { view: 'combat', x: 0.683, y: 0.224 },
      wheel: { view: 'combat', x: 0.81, y: 0.19 },
      ab66: { view: 'airbus', x: 0.32, y: 0.312 },
      ab67: { view: 'airbus', x: 0.785, y: 0.29 },
      ap68: { view: 'boeing', x: 0.175, y: 0.261 },
      toga69: { view: 'boeing', x: 0.415, y: 0.504 },
      rev70: { view: 'boeing', x: 0.37, y: 0.583 },
      rev71: { view: 'boeing', x: 0.385, y: 0.648 },
      ap72: { view: 'boeing', x: 0.725, y: 0.232 },
      toga73: { view: 'boeing', x: 0.565, y: 0.496 },
      rev74: { view: 'boeing', x: 0.69, y: 0.572 },
      rev75: { view: 'boeing', x: 0.685, y: 0.637 },
    },
  },
  // builtin-virpil-vmax-prime: exact callouts via photoTplExactViews (2026-10-09 export).
  'builtin-winctrl-orion': {
    views: [{ id: 'panel', label: 'Panel', photo: 'winctrl-orion-right' }, { id: 'rgrip', label: 'Right grip', photo: 'winctrl-orion-right' }, { id: 'left', label: 'Left grip + top row', photo: 'winctrl-orion-left' }],
    anchors: {
      roll: { view: 'panel', x: 0.172, y: 0.531 },
      pitch: { view: 'panel', x: 0.245, y: 0.568 },
      adv: { view: 'panel', x: 0.337, y: 0.562 },
      hdg: { view: 'panel', x: 0.287, y: 0.649 },
      crs: { view: 'panel', x: 0.348, y: 0.684 },
      lts: { view: 'panel', x: 0.422, y: 0.717 },
      marm: { view: 'panel', x: 0.466, y: 0.622 },
      jett: { view: 'panel', x: 0.506, y: 0.68 },
      dialw: { view: 'panel', x: 0.575, y: 0.55 },
      dialwb: { view: 'panel', x: 0.58, y: 0.56 },
      hmd: { view: 'panel', x: 0.69, y: 0.537 },
      sldw: { view: 'panel', x: 0.74, y: 0.413 },
      sldwb: { view: 'panel', x: 0.745, y: 0.425 },
      aga: { view: 'panel', x: 0.6, y: 0.47 },
      wh5: { view: 'rgrip', x: 0.557, y: 0.155 },
      slide: { view: 'rgrip', x: 0.565, y: 0.211 },
      h12: { view: 'rgrip', x: 0.508, y: 0.255 },
      b11: { view: 'rgrip', x: 0.508, y: 0.312 },
      sw3: { view: 'rgrip', x: 0.573, y: 0.303 },
      h6: { view: 'rgrip', x: 0.549, y: 0.382 },
      h17: { view: 'rgrip', x: 0.585, y: 0.36 },
      zw: { view: 'rgrip', x: 0.601, y: 0.081 },
      zwb: { view: 'rgrip', x: 0.606, y: 0.09 },
      mini: { view: 'rgrip', x: 0.588, y: 0.15 },
      minib: { view: 'rgrip', x: 0.592, y: 0.16 },
      h28: { view: 'rgrip', x: 0.588, y: 0.24 },
      rthr: { view: 'rgrip', x: 0.35, y: 0.2 },
      lbar: { view: 'left', x: 0.414, y: 0.83 },
      hook: { view: 'left', x: 0.368, y: 0.771 },
      wfold: { view: 'left', x: 0.316, y: 0.752 },
      gear: { view: 'left', x: 0.232, y: 0.7 },
      pbrk: { view: 'left', x: 0.184, y: 0.667 },
      flap: { view: 'left', x: 0.123, y: 0.654 },
      lthr: { view: 'left', x: 0.55, y: 0.08 },
      lbtn: { view: 'left', x: 0.569, y: 0.654 },
      rz: { view: 'left', x: 0.799, y: 0.255 },
      rzb: { view: 'left', x: 0.8, y: 0.27 },
      t57: { view: 'left', x: 0.84, y: 0.33 },
      h51: { view: 'left', x: 0.512, y: 0.203 },
      b50: { view: 'left', x: 0.431, y: 0.177 },
      b56: { view: 'left', x: 0.667, y: 0.249 },
    },
  },
  // builtin-winctrl-ursa-combat: exact callouts via photoTplExactViews (Federico's export) — not listed here.


  // ---- photo-only / new devices from Federico's exports (2026-10-06) ----
  // Photo-only templates (empty callouts) still show the picture so users can Customize a copy and place their own.
  // builtin-winctrl-orion-pedals: exact callouts via photoTplExact (Federico's export) — not listed here so withPhotoLayout does not re-box them.
  // builtin-winctrl-carrierace-mfd-l: exact callouts via photoTplExactViews (2026-10-09 export).
  // WinCtrl CarrierAce PTO 2: anchors on the product photo (3/4 shot) at each switch / lever; numbering per Federico's WinCtrl diagram.
  'builtin-winctrl-carrierace-pto2': {
    views: [{ id: 'main', label: 'PTO 2', photo: 'winctrl-carrierace-pto2' }],
    anchors: {
      jett1: { view: 'main', x: 0.122, y: 0.528, side: 'L' },
      gear: { view: 'main', x: 0.150, y: 0.215, side: 'L' },
      lbar: { view: 'main', x: 0.268, y: 0.238, side: 'L' },
      flap: { view: 'main', x: 0.338, y: 0.277, side: 'L' },
      ldgtaxi: { view: 'main', x: 0.254, y: 0.418, side: 'L' },
      askid: { view: 'main', x: 0.318, y: 0.424, side: 'L' },
      hbypass: { view: 'main', x: 0.206, y: 0.552, side: 'L' },
      probe: { view: 'main', x: 0.290, y: 0.585, side: 'L' },
      seljett: { view: 'main', x: 0.445, y: 0.330, side: 'R' },
      jettbtn: { view: 'main', x: 0.390, y: 0.392, side: 'R' },
      brake: { view: 'main', x: 0.402, y: 0.565, side: 'R' },
      jettsta: { view: 'main', x: 0.572, y: 0.565, side: 'R' },
      hook: { view: 'main', x: 0.650, y: 0.484, side: 'R' },
      wfold: { view: 'main', x: 0.664, y: 0.846, side: 'R' },
    },
  },
  // builtin-winctrl-carrierace-ufc-hud: exact callouts via photoTplExactViews (2026-10-09 export).
  'builtin-azeron-keypad': {
    views: [{ id: 'main', label: 'Azeron', photo: 'azeron-keypad-main' }],
    anchors: {},
  },
  // MOZA AB6 base fitted with other grips (grip variants of builtin-moza-ab6, picked by hand: same USB id 346E:1002). Federico's
  // photos, cut out with scripts/device-photos/cutout.py; positions placed by eye on the photos. Base controls sit on the same
  // AB6 keys / levers in every front photo (lit key row in front = 49-52, the far row = 53-56, front lever = S1, right lever = S2).
  'builtin-moza-ab6-mh16': {
    views: [{ id: 'front', label: 'Front (on the AB6)', photo: 'moza-ab6-mh16-front' }, { id: 'side', label: 'Grip, thumb side (module off)', photo: 'moza-ab6-mh16-side' }],
    anchors: {
      castle: { view: 'front', x: 0.29, y: 0.11, side: 'L' },
      msw: { view: 'front', x: 0.38, y: 0.17, side: 'L' },
      trim: { view: 'front', x: 0.534, y: 0.078, side: 'R' },
      trimpov: { view: 'front', x: 0.54, y: 0.085, side: 'R' },
      tms: { view: 'front', x: 0.473, y: 0.158, side: 'L' },
      dms: { view: 'front', x: 0.604, y: 0.15, side: 'R' },
      xy: { view: 'front', x: 0.63, y: 0.42, side: 'R' },
      bkeys: { view: 'front', x: 0.36, y: 0.635, side: 'L' },
      bkeysr: { view: 'front', x: 0.73, y: 0.583, side: 'R' },
      wl: { view: 'front', x: 0.635, y: 0.68, side: 'L' },
      wlb: { view: 'front', x: 0.64, y: 0.69, side: 'L' },
      wr: { view: 'front', x: 0.81, y: 0.64, side: 'R' },
      wrb: { view: 'front', x: 0.815, y: 0.65, side: 'R' },
      wpn: { view: 'side', x: 0.56, y: 0.08, side: 'R' },
      nws: { view: 'side', x: 0.19, y: 0.27, side: 'L' },
      trig: { view: 'side', x: 0.36, y: 0.37, side: 'L' },
      cms: { view: 'side', x: 0.69, y: 0.36, side: 'R' },
      fov: { view: 'side', x: 0.61, y: 0.64, side: 'R' },
      paddle: { view: 'side', x: 0.44, y: 0.69, side: 'L' },
    },
  },
  'builtin-moza-ab6-carrierace': {
    views: [
      { id: 'front', label: 'Front (on the AB6)', photo: 'moza-ab6-carrierace-front' },
      { id: 'side', label: 'Grip, thumb side', photo: 'winctrl-carrierace-side' },
      { id: 'rear', label: 'Grip, outer side', photo: 'moza-ab6-carrierace-rear' },
    ],
    anchors: {
      wpn: { view: 'front', x: 0.225, y: 0.17, side: 'L' },
      hatC: { view: 'front', x: 0.385, y: 0.13, side: 'L' },
      sel5: { view: 'front', x: 0.405, y: 0.205, side: 'L' },
      trim: { view: 'front', x: 0.51, y: 0.105, side: 'R' },
      hatB: { view: 'front', x: 0.47, y: 0.185, side: 'R' },
      xy: { view: 'front', x: 0.6, y: 0.4, side: 'R' },
      bkeys: { view: 'front', x: 0.34, y: 0.645, side: 'L' },
      bkeysr: { view: 'front', x: 0.725, y: 0.587, side: 'R' },
      wl: { view: 'front', x: 0.625, y: 0.685, side: 'L' },
      wlb: { view: 'front', x: 0.63, y: 0.695, side: 'L' },
      wr: { view: 'front', x: 0.795, y: 0.64, side: 'R' },
      wrb: { view: 'front', x: 0.8, y: 0.65, side: 'R' },
      trig: { view: 'side', x: 0.665, y: 0.367, side: 'R' },
      paddle: { view: 'side', x: 0.64, y: 0.66, side: 'R' },
      hatA: { view: 'rear', x: 0.78, y: 0.37, side: 'R' },
      rear: { view: 'rear', x: 0.7, y: 0.63, side: 'R' },
    },
  },
};
