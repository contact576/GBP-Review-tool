/**
 * The Foundly industry catalog: 36 industries, each with services, review
 * chips, terminology, AI prompt steering, and template phrase banks.
 *
 * Ordering matters for `industryForGoogleCategory`: earlier entries win on
 * substring matches, so specific industries come before broad ones
 * (e.g. "tire shop" hits auto_repair before retail_store sees "shop").
 *
 * Voice rules for phrase banks:
 * - experience5/closer5: strong, delighted 5-star register.
 * - experience4/closer4: measured 4-star register — "really good, minor
 *   imperfection". Never "exceeded expectations", "flawless", "best ever".
 * - Clinical and regulated industries avoid outcome and result claims.
 */

import type { Industry } from "./types";

const restaurant: Industry = {
  key: "restaurant",
  label: "Restaurant",
  group: "dining",
  googleCategories: [
    "restaurant",
    "diner",
    "bistro",
    "eatery",
    "pizzeria",
    "steakhouse",
    "sushi",
    "taqueria",
    "grill",
    "brasserie",
  ],
  services: [
    "Dine-in",
    "Takeout",
    "Delivery",
    "Catering",
    "Private events",
    "Weekend brunch",
    "Happy hour",
    "Group reservations",
  ],
  attributes: [
    "Great food",
    "Friendly service",
    "Fast service",
    "Great value",
    "Cozy atmosphere",
    "Generous portions",
    "Fresh ingredients",
    "Kid friendly",
  ],
  neutralAttributes: ["First visit", "Regular here", "Special occasion"],
  terminology: { customer: "guest", visit: "visit", staff: "server" },
  promptContext:
    "Warm diner voice; mention food and service, never invent menu items.",
  phrases: {
    experience5: [
      "the food was outstanding from the first bite",
      "every dish we tried was full of flavor",
      "our server made the whole night feel special",
      "the atmosphere was warm and inviting",
      "portions were generous and everything came out hot",
    ],
    experience4: [
      "the food was really good and came out quickly",
      "solid meal overall, just a short wait for a table",
      "everything tasted fresh, though it got a bit loud",
      "service was friendly even during the dinner rush",
    ],
    closer5: [
      "already planning my next visit",
      "this is our new go-to spot",
      "telling everyone I know about this place",
    ],
    closer4: ["would happily come back", "worth a visit if you are nearby"],
  },
};

const cafe: Industry = {
  key: "cafe",
  label: "Cafe",
  group: "dining",
  googleCategories: ["cafe", "café", "coffee", "espresso", "tea house", "tearoom"],
  services: [
    "Espresso drinks",
    "Brewed coffee",
    "Loose-leaf tea",
    "Pastries",
    "Breakfast sandwiches",
    "Light lunch",
    "Cold brew",
    "Wifi seating",
  ],
  attributes: [
    "Great coffee",
    "Cozy vibe",
    "Friendly baristas",
    "Quick service",
    "Good pastries",
    "Comfy seating",
    "Fair prices",
  ],
  neutralAttributes: ["First visit", "Regular here", "Stopped in while nearby"],
  terminology: { customer: "customer", visit: "visit", staff: "barista" },
  promptContext:
    "Casual regular's voice on drinks, food, and vibe; no invented menu.",
  phrases: {
    experience5: [
      "the coffee here is the highlight of my morning",
      "my latte was smooth and the pastry was still warm",
      "the baristas remember my order and always say hi",
      "such a cozy spot to settle in with a book",
    ],
    experience4: [
      "good coffee and a calm place to sit for a while",
      "my drink was made well, just a short line at the counter",
      "nice pastries and friendly staff behind the bar",
    ],
    closer5: [
      "this is officially my new morning stop",
      "already looking forward to tomorrow's coffee",
      "bringing all my friends here",
    ],
    closer4: ["would stop by again", "a solid pick for a coffee break"],
  },
};

const bakery: Industry = {
  key: "bakery",
  label: "Bakery",
  group: "dining",
  googleCategories: [
    "bakery",
    "patisserie",
    "pastry",
    "cake shop",
    "donut",
    "bagel",
    "bake shop",
  ],
  services: [
    "Fresh bread",
    "Custom cakes",
    "Pastries",
    "Cookies",
    "Wedding cakes",
    "Gluten-free options",
    "Coffee",
    "Special orders",
  ],
  attributes: [
    "Fresh baked",
    "Beautiful cakes",
    "Friendly staff",
    "Great selection",
    "Fair prices",
    "Smells wonderful",
    "Made to order",
  ],
  neutralAttributes: ["First visit", "Regular customer", "Custom order pickup"],
  terminology: { customer: "customer", visit: "visit", staff: "baker" },
  promptContext:
    "Friendly customer voice on baked goods and service; no invented items.",
  phrases: {
    experience5: [
      "everything is baked fresh and you can taste it",
      "the custom cake was even prettier than the photo I showed",
      "the bread was still warm when I got it home",
      "the staff clearly love what they bake",
    ],
    experience4: [
      "really good pastries, my favorite sold out a bit early",
      "the cake tasted great and pickup was easy",
      "fresh bread and friendly service at the counter",
    ],
    closer5: [
      "I will never buy grocery store cake again",
      "already ordered my next birthday cake here",
      "this bakery has a customer for life",
    ],
    closer4: [
      "would order from them again",
      "worth a stop when you are craving something sweet",
    ],
  },
};

const salon: Industry = {
  key: "salon",
  label: "Hair Salon",
  group: "beauty",
  googleCategories: [
    "hair salon",
    "beauty salon",
    "nail salon",
    "salon",
    "hairdresser",
    "hair stylist",
    "blow dry",
  ],
  services: [
    "Haircuts",
    "Color",
    "Highlights",
    "Balayage",
    "Blowouts",
    "Keratin treatments",
    "Hair extensions",
    "Bridal styling",
  ],
  attributes: [
    "Loved the result",
    "Listened to me",
    "Relaxing visit",
    "On time",
    "Great value",
    "Skilled stylist",
    "Easy booking",
    "Clean salon",
  ],
  neutralAttributes: ["First visit", "Regular client", "Trying a new look"],
  terminology: { customer: "client", visit: "appointment", staff: "stylist" },
  promptContext:
    "Upbeat client voice on the result and stylist; no invented treatments.",
  phrases: {
    experience5: [
      "my stylist understood exactly what I wanted",
      "I walked out feeling like a new person",
      "the color turned out even better than my inspiration photo",
      "they took their time and the cut shows it",
    ],
    experience4: [
      "really happy with my cut, just a short wait past my slot",
      "the color came out well and the price was fair",
      "my stylist listened and the result is close to what I asked",
    ],
    closer5: [
      "already booked my next appointment",
      "I finally found my salon",
      "sending all my friends to my stylist",
    ],
    closer4: ["would book here again", "planning to come back for my next trim"],
  },
};

const barber: Industry = {
  key: "barber",
  label: "Barber Shop",
  group: "beauty",
  googleCategories: ["barber"],
  services: [
    "Haircuts",
    "Beard trims",
    "Hot towel shaves",
    "Skin fades",
    "Line-ups",
    "Kids cuts",
    "Head shaves",
    "Gray blending",
  ],
  attributes: [
    "Clean fade",
    "Sharp line-up",
    "Great conversation",
    "On time",
    "Fair price",
    "Relaxed shop",
    "Consistent cuts",
  ],
  neutralAttributes: ["First visit", "Regular client", "Walk-in"],
  terminology: { customer: "client", visit: "appointment", staff: "barber" },
  promptContext:
    "Relaxed client voice about the cut and shop feel; no invented details.",
  phrases: {
    experience5: [
      "hands down the cleanest fade I have had in years",
      "my barber gets it right every single time",
      "the hot towel shave felt like a reset button",
      "great cut, great conversation, zero rush",
    ],
    experience4: [
      "solid cut and a chill shop, just a bit of a wait",
      "the fade came out clean and the price was fair",
      "good attention to detail on the beard trim",
    ],
    closer5: [
      "not letting anyone else touch my hair",
      "already locked in my next appointment",
      "found my barber for good",
    ],
    closer4: [
      "would sit in that chair again",
      "planning to make this my regular spot",
    ],
  },
};

const spa: Industry = {
  key: "spa",
  label: "Spa",
  group: "beauty",
  googleCategories: ["spa", "massage", "facial", "esthetician", "wellness center"],
  services: [
    "Massage therapy",
    "Facials",
    "Body treatments",
    "Manicures",
    "Pedicures",
    "Waxing",
    "Couples packages",
    "Gift cards",
  ],
  attributes: [
    "So relaxing",
    "Calming space",
    "Skilled therapist",
    "Spotlessly clean",
    "On time",
    "Worth the price",
    "Quiet and peaceful",
  ],
  neutralAttributes: ["First visit", "Regular guest", "Gift-card visit"],
  terminology: { customer: "guest", visit: "appointment", staff: "therapist" },
  promptContext:
    "Calm guest voice on relaxation and care; no health or medical claims.",
  phrases: {
    experience5: [
      "I left feeling completely restored",
      "the massage melted a week of stress away",
      "every detail is designed to help you unwind",
      "my therapist checked in on pressure the whole time",
    ],
    experience4: [
      "very relaxing hour, the room next door was a little noisy",
      "great facial and a calm space to unwind",
      "the massage was really good, booking took a couple tries",
    ],
    closer5: [
      "already booked my next massage",
      "this is my new self-care ritual",
      "treating my best friend to a visit next",
    ],
    closer4: [
      "would return for another treatment",
      "a nice way to unwind now and then",
    ],
  },
};

const physiotherapy: Industry = {
  key: "physiotherapy",
  label: "Physiotherapy Clinic",
  group: "health",
  googleCategories: ["physiotherap", "physical therap", "sports injury clinic"],
  services: [
    "Injury rehab",
    "Sports physiotherapy",
    "Manual therapy",
    "Dry needling",
    "Post-surgical rehab",
    "Exercise programs",
    "Concussion care",
    "Pelvic health",
  ],
  attributes: [
    "Clear explanations",
    "Personalized plan",
    "Friendly staff",
    "Easy booking",
    "On time",
    "Direct billing",
    "Never felt rushed",
    "Great follow-up",
  ],
  neutralAttributes: ["First visit", "Returning patient", "Doctor referral"],
  terminology: {
    customer: "patient",
    visit: "appointment",
    staff: "physiotherapist",
  },
  promptContext:
    "Respectful patient voice; never claim cures or cite medical details.",
  phrases: {
    experience5: [
      "my physiotherapist explained everything in plain language",
      "the exercise plan was tailored to me, not a handout",
      "every session felt focused on my goals",
      "they took the time to actually listen",
    ],
    experience4: [
      "good sessions overall, booking a follow-up took a while",
      "clear guidance and a plan I can actually follow",
      "the clinic runs on time and the care feels thorough",
    ],
    closer5: [
      "I finally feel confident in my recovery plan",
      "recommending this clinic to my whole team",
      "so glad my doctor pointed me here",
    ],
    closer4: [
      "would recommend to friends and family",
      "planning to continue my sessions here",
    ],
  },
};

const dental: Industry = {
  key: "dental",
  label: "Dental Clinic",
  group: "health",
  googleCategories: ["dentist", "dental", "orthodont", "endodont", "oral surge"],
  services: [
    "Checkups and cleanings",
    "Fillings",
    "Teeth whitening",
    "Crowns and bridges",
    "Root canals",
    "Invisalign",
    "Emergency visits",
    "Kids dentistry",
  ],
  attributes: [
    "Gentle care",
    "Painless visit",
    "Clean clinic",
    "On time",
    "Explained everything",
    "Fair pricing",
    "Calming staff",
    "Easy booking",
  ],
  neutralAttributes: ["First visit", "Long-time patient", "Came with my kids"],
  terminology: { customer: "patient", visit: "appointment", staff: "dentist" },
  promptContext:
    "Reassuring patient voice; no clinical outcomes or treatment details.",
  phrases: {
    experience5: [
      "the gentlest cleaning I have ever had",
      "they explained every step before doing it",
      "the whole team put me completely at ease",
      "no lectures, no pressure, just great care",
    ],
    experience4: [
      "a calm, well-run visit with a short wait",
      "the hygienist was gentle and thorough",
      "clear explanations and no surprise charges",
    ],
    closer5: [
      "I actually look forward to my next cleaning",
      "my whole family is switching here",
      "finally found a dentist I trust",
    ],
    closer4: [
      "would keep coming back",
      "happy to return for my next checkup",
    ],
  },
};

const medicalClinic: Industry = {
  key: "medical_clinic",
  label: "Medical Clinic",
  group: "health",
  googleCategories: [
    "medical clinic",
    "medical center",
    "walk-in clinic",
    "family practice",
    "urgent care",
    "doctor",
    "physician",
  ],
  services: [
    "Family medicine",
    "Walk-in visits",
    "Annual physicals",
    "Vaccinations",
    "Lab work",
    "Minor procedures",
    "Referrals",
    "Telehealth visits",
  ],
  attributes: [
    "Caring staff",
    "Short wait",
    "Felt listened to",
    "Clean clinic",
    "Easy booking",
    "Clear next steps",
    "Respectful team",
  ],
  neutralAttributes: ["First visit", "Returning patient", "Walk-in"],
  terminology: {
    customer: "patient",
    visit: "appointment",
    staff: "practitioner",
  },
  promptContext:
    "Respectful patient voice; never state diagnoses, outcomes, or PHI.",
  phrases: {
    experience5: [
      "the practitioner truly listened without rushing me",
      "from check-in to checkout everything ran smoothly",
      "the staff treated me like a person, not a number",
      "questions answered clearly and kindly",
    ],
    experience4: [
      "good visit overall with a reasonable wait",
      "the staff were kind and the clinic was clean",
      "check-in was easy and the visit felt unhurried",
    ],
    closer5: [
      "so relieved to have found this clinic",
      "my whole family will be coming here",
      "this is what healthcare should feel like",
    ],
    closer4: ["would come back when needed", "a dependable clinic to have nearby"],
  },
};

const chiropractic: Industry = {
  key: "chiropractic",
  label: "Chiropractic Clinic",
  group: "health",
  googleCategories: ["chiropract"],
  services: [
    "Spinal adjustments",
    "Posture assessments",
    "Sports injury care",
    "Massage therapy",
    "Custom orthotics",
    "Ergonomic advice",
    "Maintenance visits",
  ],
  attributes: [
    "Gentle adjustments",
    "Clear treatment plan",
    "Friendly staff",
    "On time",
    "Easy booking",
    "Listened first",
    "No pressure to overbook",
  ],
  neutralAttributes: ["First visit", "Regular patient", "Referred by a friend"],
  terminology: {
    customer: "patient",
    visit: "appointment",
    staff: "chiropractor",
  },
  promptContext:
    "Grateful patient voice on care quality; no cure or outcome claims.",
  phrases: {
    experience5: [
      "the assessment was thorough before any adjustment",
      "they explain what they are doing and why",
      "I always leave feeling looser and taller",
      "care plans here feel honest, never salesy",
    ],
    experience4: [
      "good adjustment and a clear explanation of the plan",
      "the visit ran on time and the staff were friendly",
      "solid care, the front desk was a little busy",
    ],
    closer5: [
      "my back and I are customers for life",
      "already scheduled my next adjustment",
      "recommending them to my desk-job friends",
    ],
    closer4: [
      "would go back when my back acts up",
      "planning to keep up my visits",
    ],
  },
};

const pharmacy: Industry = {
  key: "pharmacy",
  label: "Pharmacy",
  group: "health",
  googleCategories: ["pharmacy", "drug store", "drugstore", "chemist", "apothecary"],
  services: [
    "Prescription filling",
    "Refill reminders",
    "Vaccinations",
    "Medication reviews",
    "Compounding",
    "Blister packs",
    "Delivery",
    "Health advice",
  ],
  attributes: [
    "Fast refills",
    "Helpful pharmacist",
    "Short wait",
    "Answered my questions",
    "Friendly staff",
    "Well stocked",
    "Easy transfers",
  ],
  neutralAttributes: ["First visit", "Regular customer", "Picking up for family"],
  terminology: { customer: "customer", visit: "visit", staff: "pharmacist" },
  promptContext:
    "Everyday customer voice on service; never name medications or health.",
  phrases: {
    experience5: [
      "the pharmacist took real time to answer my questions",
      "refills are ready fast and they text me when done",
      "they treat you like a neighbor, not a number",
      "transferring my prescriptions here was effortless",
    ],
    experience4: [
      "quick service and helpful answers at the counter",
      "my refill was ready on time, parking was a bit tight",
      "friendly staff and a well-run counter",
    ],
    closer5: [
      "never going back to the big chain",
      "this is our family pharmacy now",
      "so glad I switched pharmacies",
    ],
    closer4: ["would keep filling here", "a reliable pharmacy to have close by"],
  },
};

const generalContractor: Industry = {
  key: "general_contractor",
  label: "General Contractor",
  group: "trades",
  googleCategories: [
    "general contractor",
    "construction company",
    "home builder",
    "custom home",
    "design-build",
  ],
  services: [
    "Home additions",
    "Basement finishing",
    "Kitchen remodels",
    "Bathroom remodels",
    "Structural repairs",
    "Permits and planning",
    "Project management",
    "Custom builds",
  ],
  attributes: [
    "On schedule",
    "Honest quote",
    "Quality workmanship",
    "Great communication",
    "Tidy job site",
    "No surprise costs",
    "Licensed and insured",
  ],
  neutralAttributes: ["First project", "Repeat client", "Compared several quotes"],
  terminology: { customer: "client", visit: "project", staff: "contractor" },
  promptContext:
    "Homeowner voice on workmanship and process; no invented project specs.",
  phrases: {
    experience5: [
      "the crew showed up when they said they would, every day",
      "the finished work looks like it was always part of the house",
      "updates came without me ever having to chase them",
      "the quote was honest and the final bill matched it",
    ],
    experience4: [
      "good work overall with a couple of small schedule slips",
      "solid craftsmanship and steady communication",
      "the project wrapped up close to the estimate",
    ],
    closer5: [
      "already planning our next project with them",
      "the only contractor I will call from now on",
      "recommending them to every homeowner I know",
    ],
    closer4: ["would hire them again", "a dependable crew for future work"],
  },
};

const renovation: Industry = {
  key: "renovation",
  label: "Renovation Company",
  group: "trades",
  googleCategories: [
    "renovation",
    "remodel",
    "kitchen remodel",
    "bathroom remodel",
    "home improvement",
  ],
  services: [
    "Kitchen renovations",
    "Bathroom renovations",
    "Basement finishing",
    "Flooring",
    "Painting",
    "Custom carpentry",
    "Open-concept conversions",
    "Design consultation",
  ],
  attributes: [
    "Quality work",
    "On schedule",
    "Great communication",
    "Tidy site",
    "Fair pricing",
    "Would rehire",
    "Design help",
    "No surprise costs",
  ],
  neutralAttributes: ["First renovation", "Repeat client", "Lived in during work"],
  terminology: { customer: "client", visit: "project", staff: "contractor" },
  promptContext:
    "Homeowner voice on the finished space; no invented costs or timelines.",
  phrases: {
    experience5: [
      "our kitchen looks like it came out of a magazine",
      "they treated our home like their own",
      "the crew cleaned up every single day before leaving",
      "the design suggestions made the space so much better",
    ],
    experience4: [
      "really happy with the result, timeline ran a bit long",
      "good craftsmanship and honest communication throughout",
      "the space turned out well and the site stayed tidy",
    ],
    closer5: [
      "already dreaming up the next room for them to do",
      "our home finally feels like ours",
      "recommending them to everyone planning a reno",
    ],
    closer4: [
      "would use them for the next project",
      "would recommend them to neighbors",
    ],
  },
};

const roofing: Industry = {
  key: "roofing",
  label: "Roofing Company",
  group: "trades",
  googleCategories: ["roofing", "roofer", "roof repair", "eavestrough", "gutter"],
  services: [
    "Shingle replacement",
    "Leak repair",
    "Storm damage repair",
    "Roof inspections",
    "Flat roofing",
    "Gutter installation",
    "Skylight installation",
    "Emergency tarping",
  ],
  attributes: [
    "Honest quote",
    "Cleaned up after",
    "On schedule",
    "Quality materials",
    "Clear warranty",
    "Fast response",
    "Insurance help",
  ],
  neutralAttributes: ["First time using them", "Repeat customer", "After a storm"],
  terminology: { customer: "client", visit: "project", staff: "roofer" },
  promptContext:
    "Homeowner voice on crew and cleanup; no invented materials or prices.",
  phrases: {
    experience5: [
      "the new roof looks fantastic and the crew was quick",
      "not a single nail left in the driveway",
      "they walked me through photos of the damage",
      "the quote was straightforward with zero pressure",
    ],
    experience4: [
      "solid work on the roof, scheduling shifted with weather",
      "fair price and a crew that cleaned up well",
      "good repair job and clear communication",
    ],
    closer5: [
      "the only roofers I will ever call",
      "sending every neighbor with a leak their way",
      "our roof is ready for anything now",
    ],
    closer4: ["would call them again", "a solid choice for roof work"],
  },
};

const plumbing: Industry = {
  key: "plumbing",
  label: "Plumbing Company",
  group: "trades",
  googleCategories: ["plumb", "drain", "water heater"],
  services: [
    "Leak repair",
    "Drain cleaning",
    "Water heater install",
    "Toilet repair",
    "Faucet replacement",
    "Sump pumps",
    "Pipe replacement",
    "Emergency service",
  ],
  attributes: [
    "Fixed it fast",
    "Fair pricing",
    "On time",
    "Tidy work",
    "Explained the issue",
    "Upfront quote",
    "Friendly plumber",
  ],
  neutralAttributes: ["First call", "Repeat customer", "Emergency visit"],
  terminology: { customer: "customer", visit: "service call", staff: "plumber" },
  promptContext:
    "Homeowner voice on speed and fix quality; no invented parts or costs.",
  phrases: {
    experience5: [
      "he found the leak in minutes and fixed it on the spot",
      "the price quoted was the price charged",
      "they showed up fast and got straight to work",
      "clean, quick, and no upselling",
    ],
    experience4: [
      "the repair went well and the price was reasonable",
      "quick fix, just a slightly late arrival window",
      "good work and everything was left clean",
    ],
    closer5: [
      "saved their number for life",
      "the only plumber I am calling from now on",
      "worth every penny for the peace of mind",
    ],
    closer4: [
      "would call again for future issues",
      "a dependable plumber to have on hand",
    ],
  },
};

const electrician: Industry = {
  key: "electrician",
  label: "Electrician",
  group: "trades",
  googleCategories: ["electrician", "electrical"],
  services: [
    "Panel upgrades",
    "Lighting installation",
    "Outlet and switch repair",
    "EV charger install",
    "Wiring inspections",
    "Ceiling fans",
    "Hot tub hookups",
    "Troubleshooting",
  ],
  attributes: [
    "Safe and tidy",
    "On time",
    "Fair quote",
    "Explained the work",
    "Clean install",
    "Licensed pro",
    "Quick turnaround",
  ],
  neutralAttributes: ["First call", "Repeat customer", "Small job booking"],
  terminology: {
    customer: "customer",
    visit: "service call",
    staff: "electrician",
  },
  promptContext:
    "Homeowner voice on safety and tidiness; no invented specs or prices.",
  phrases: {
    experience5: [
      "the wiring work is neat enough to photograph",
      "he explained the panel upgrade in plain english",
      "showed up on time and finished ahead of the estimate",
      "everything was tested and labeled before he left",
    ],
    experience4: [
      "good clean work at a fair hourly rate",
      "solid job, just needed to reschedule once",
      "clear quote and tidy work on the outlets",
    ],
    closer5: [
      "my go-to electrician from now on",
      "already booked him for the next project",
      "worth the call for anything electrical",
    ],
    closer4: [
      "would hire again for electrical work",
      "a safe pair of hands for the house",
    ],
  },
};

const hvac: Industry = {
  key: "hvac",
  label: "HVAC Company",
  group: "trades",
  googleCategories: ["hvac", "heating", "air conditioning", "furnace", "heat pump"],
  services: [
    "Furnace repair",
    "AC installation",
    "Duct cleaning",
    "Heat pump install",
    "Thermostat setup",
    "Seasonal tune-ups",
    "Air quality testing",
    "Emergency service",
  ],
  attributes: [
    "Fixed it fast",
    "On time",
    "Fair pricing",
    "Explained the issue",
    "Tidy work",
    "Honest advice",
    "Friendly tech",
  ],
  neutralAttributes: ["First call", "Repeat customer", "Seasonal tune-up"],
  terminology: {
    customer: "customer",
    visit: "service call",
    staff: "technician",
  },
  promptContext:
    "Homeowner voice on comfort restored; no invented equipment or prices.",
  phrases: {
    experience5: [
      "the house was warm again within the hour",
      "the tech explained the fix without any jargon",
      "honest advice instead of pushing a new unit",
      "fast, tidy, and fairly priced",
    ],
    experience4: [
      "the repair was done well at a fair price",
      "arrived within the window and worked quickly",
      "good service, booking took a couple of days",
    ],
    closer5: [
      "signing up for their maintenance plan",
      "the only hvac company I will call now",
      "our furnace is in good hands",
    ],
    closer4: [
      "would call them for the next tune-up",
      "a solid choice for heating and cooling",
    ],
  },
};

const cleaning: Industry = {
  key: "cleaning",
  label: "Cleaning Service",
  group: "trades",
  googleCategories: [
    "cleaning service",
    "house cleaning",
    "maid",
    "janitorial",
    "carpet cleaning",
  ],
  services: [
    "Recurring home cleaning",
    "Deep cleaning",
    "Move-in/move-out cleans",
    "Office cleaning",
    "Post-renovation cleanup",
    "Window cleaning",
    "Carpet cleaning",
  ],
  attributes: [
    "Spotless results",
    "Trustworthy team",
    "On time",
    "Consistent quality",
    "Easy scheduling",
    "Fair rates",
    "Great attention to detail",
  ],
  neutralAttributes: ["First clean", "Recurring client", "One-time deep clean"],
  terminology: { customer: "client", visit: "cleaning", staff: "cleaner" },
  promptContext:
    "Happy client voice on spotless results; no invented rooms or pricing.",
  phrases: {
    experience5: [
      "the house has never looked this good",
      "they clean corners I did not know existed",
      "coming home after cleaning day is the best feeling",
      "same great result every single visit",
    ],
    experience4: [
      "the place looks great, one shelf got missed",
      "reliable team and a consistently tidy result",
      "good clean and easy to schedule",
    ],
    closer5: [
      "worth every penny of my weekends back",
      "never cleaning my own oven again",
      "booked them on a recurring schedule",
    ],
    closer4: ["would book them again", "planning to keep the monthly visits"],
  },
};

const moving: Industry = {
  key: "moving",
  label: "Moving Company",
  group: "trades",
  googleCategories: ["moving company", "mover", "moving service", "relocation"],
  services: [
    "Local moving",
    "Long-distance moving",
    "Packing services",
    "Furniture disassembly",
    "Storage",
    "Piano moving",
    "Office relocation",
    "Moving supplies",
  ],
  attributes: [
    "Careful with items",
    "On time",
    "Fast crew",
    "Fair quote",
    "No hidden fees",
    "Friendly movers",
    "Nothing damaged",
  ],
  neutralAttributes: ["First move with them", "Local move", "Long-distance move"],
  terminology: { customer: "customer", visit: "move", staff: "mover" },
  promptContext:
    "Relieved customer voice on care with items; no invented inventory.",
  phrases: {
    experience5: [
      "not a single scratch on anything",
      "the crew hustled all day with a smile",
      "they wrapped my furniture like it was their own",
      "the final bill matched the quote exactly",
    ],
    experience4: [
      "the move went smoothly with one small delay",
      "careful crew and a fair, clear price",
      "everything arrived in one piece, just a late start",
    ],
    closer5: [
      "the only movers I will ever use",
      "recommending them to everyone who is relocating",
      "worth every dollar on moving day",
    ],
    closer4: ["would use them for the next move", "a solid crew for a big day"],
  },
};

const realEstate: Industry = {
  key: "real_estate",
  label: "Real Estate Agent",
  group: "realestate",
  googleCategories: ["real estate", "realtor", "realty", "estate agent"],
  services: [
    "Home buying",
    "Home selling",
    "Market evaluations",
    "Staging advice",
    "First-time buyer help",
    "Investment properties",
    "Relocation support",
    "Open houses",
  ],
  attributes: [
    "Knows the market",
    "Great negotiator",
    "Always available",
    "Honest advice",
    "Great communication",
    "Patient with us",
    "Smooth process",
  ],
  neutralAttributes: ["First-time buyer", "Repeat client", "Referred by family"],
  terminology: { customer: "client", visit: "transaction", staff: "agent" },
  promptContext:
    "Grateful client voice on guidance; never cite prices or guarantees.",
  phrases: {
    experience5: [
      "our agent answered every question, even late at night",
      "we always knew exactly where things stood",
      "the negotiation advice was worth its weight in gold",
      "they made a stressful process feel manageable",
    ],
    experience4: [
      "a smooth process with steady communication",
      "good guidance through a tricky market",
      "responsive and organized from listing to closing",
    ],
    closer5: [
      "we will never use another agent",
      "already sent two friends their way",
      "the first call for our next move",
    ],
    closer4: [
      "would work with them again",
      "a safe pair of hands for a big decision",
    ],
  },
};

const mortgageBroker: Industry = {
  key: "mortgage_broker",
  label: "Mortgage Broker",
  group: "realestate",
  googleCategories: ["mortgage"],
  services: [
    "Mortgage pre-approvals",
    "First-time buyer mortgages",
    "Refinancing",
    "Renewals",
    "Rate comparisons",
    "Self-employed mortgages",
    "Debt consolidation advice",
  ],
  attributes: [
    "Explained everything",
    "Fast responses",
    "Found great options",
    "Patient with questions",
    "Stress-free process",
    "Honest advice",
    "Great communication",
  ],
  neutralAttributes: ["First-time buyer", "Renewal client", "Agent referral"],
  terminology: { customer: "client", visit: "application", staff: "broker" },
  promptContext:
    "Grateful client voice on clarity; never cite rates, terms, or results.",
  phrases: {
    experience5: [
      "every step was explained in plain language",
      "they compared options I never would have found on my own",
      "responses came back within the hour, every time",
      "the paperwork felt effortless with their guidance",
    ],
    experience4: [
      "a smooth application with clear communication",
      "helpful guidance and a mostly painless paperwork process",
      "questions were answered quickly and clearly",
    ],
    closer5: [
      "sending every first-time buyer I know here",
      "we would not do a mortgage without them",
      "made a huge decision feel easy",
    ],
    closer4: [
      "would use them at renewal time",
      "a helpful guide through the process",
    ],
  },
};

const insuranceAgency: Industry = {
  key: "insurance_agency",
  label: "Insurance Agency",
  group: "professional",
  googleCategories: ["insurance"],
  services: [
    "Home insurance",
    "Auto insurance",
    "Life insurance",
    "Business insurance",
    "Tenant insurance",
    "Policy reviews",
    "Claims support",
    "Bundling advice",
  ],
  attributes: [
    "Explained my coverage",
    "Quick responses",
    "Found the right fit",
    "No pressure",
    "Helpful with claims",
    "Annual reviews",
    "Friendly team",
  ],
  neutralAttributes: ["New client", "Long-time client", "Switched agencies"],
  terminology: { customer: "client", visit: "policy review", staff: "agent" },
  promptContext:
    "Client voice on responsiveness; never cite premiums, payouts, claims.",
  phrases: {
    experience5: [
      "my agent explained coverage I had been guessing at for years",
      "they check in every renewal to keep the fit right",
      "claims help was calm, clear, and fast",
      "real advice instead of a sales pitch",
    ],
    experience4: [
      "clear answers and a policy that fits",
      "helpful review of my coverage with no pressure",
      "responsive service when I had questions",
    ],
    closer5: [
      "our whole family insures through them now",
      "finally an agency that feels on my side",
      "recommending them to friends and neighbors",
    ],
    closer4: ["would renew with them", "a solid agency to have in your corner"],
  },
};

const immigrationConsultant: Industry = {
  key: "immigration_consultant",
  label: "Immigration Consultant",
  group: "professional",
  googleCategories: ["immigration"],
  services: [
    "Study permits",
    "Work permits",
    "Permanent residency",
    "Express entry profiles",
    "Family sponsorship",
    "Citizenship applications",
    "Visitor visas",
    "LMIA support",
  ],
  attributes: [
    "Clear guidance",
    "Responsive",
    "Organized paperwork",
    "Patient with questions",
    "Honest expectations",
    "Multilingual team",
    "Kept me informed",
  ],
  neutralAttributes: ["First consultation", "Ongoing client", "Friend referral"],
  terminology: {
    customer: "client",
    visit: "consultation",
    staff: "consultant",
  },
  promptContext:
    "Hopeful client voice on support; never claim case outcomes or timing.",
  phrases: {
    experience5: [
      "they explained every requirement in plain language",
      "my file was organized down to the last document",
      "updates came before I even thought to ask",
      "honest about the process from day one",
    ],
    experience4: [
      "clear guidance through a confusing process",
      "organized, responsive, and realistic with us",
      "questions were answered patiently at every step",
    ],
    closer5: [
      "I trusted them with my future and would again",
      "recommending them to everyone starting the process",
      "grateful we chose this team",
    ],
    closer4: [
      "would recommend their guidance",
      "a steady hand through the paperwork",
    ],
  },
};

const lawFirm: Industry = {
  key: "law_firm",
  label: "Law Firm",
  group: "professional",
  googleCategories: [
    "law firm",
    "lawyer",
    "attorney",
    "legal service",
    "notary",
    "paralegal",
  ],
  services: [
    "Family law",
    "Real estate law",
    "Wills and estates",
    "Corporate law",
    "Civil litigation",
    "Employment law",
    "Notary services",
    "Initial consultations",
  ],
  attributes: [
    "Clear communication",
    "Responsive",
    "Straight answers",
    "Transparent billing",
    "Felt heard",
    "Professional team",
    "Kept me informed",
  ],
  neutralAttributes: ["First consultation", "Returning client", "Friend referral"],
  terminology: { customer: "client", visit: "consultation", staff: "lawyer" },
  promptContext:
    "Client voice on communication; never claim results or case details.",
  phrases: {
    experience5: [
      "complex issues explained in language I could follow",
      "every email was answered within a day",
      "I always understood the next step and the cost",
      "they listened first and advised second",
    ],
    experience4: [
      "professional, organized, and easy to reach",
      "clear advice and billing with no surprises",
      "steady communication through a stressful time",
    ],
    closer5: [
      "the first firm I will call if I need counsel again",
      "recommending them without hesitation",
      "grateful to have had them in my corner",
    ],
    closer4: [
      "would use this firm again",
      "a professional team worth talking to",
    ],
  },
};

const accounting: Industry = {
  key: "accounting",
  label: "Accounting Firm",
  group: "professional",
  googleCategories: ["accounting", "accountant", "tax preparation", "bookkeep", "cpa"],
  services: [
    "Personal tax returns",
    "Corporate tax",
    "Bookkeeping",
    "Payroll",
    "GST/HST filings",
    "Tax planning",
    "Financial statements",
    "Audit support",
  ],
  attributes: [
    "Explains things simply",
    "Responsive",
    "Accurate and thorough",
    "Fair fees",
    "Proactive advice",
    "Year-round support",
    "Organized process",
  ],
  neutralAttributes: ["First tax season", "Long-time client", "Just switched"],
  terminology: { customer: "client", visit: "engagement", staff: "accountant" },
  promptContext:
    "Client voice on clarity and trust; never cite refunds or tax results.",
  phrases: {
    experience5: [
      "tax season finally feels manageable",
      "they explain the numbers in plain english",
      "proactive advice all year, not just in april",
      "organized, accurate, and always on time",
    ],
    experience4: [
      "smooth filing process with clear communication",
      "helpful, organized, and fairly priced",
      "good advice and a straightforward process",
    ],
    closer5: [
      "never doing my own taxes again",
      "my books are in the best hands",
      "recommending them to every business owner I know",
    ],
    closer4: ["would file with them again", "a reliable choice at tax time"],
  },
};

const autoRepair: Industry = {
  key: "auto_repair",
  label: "Auto Repair Shop",
  group: "auto",
  googleCategories: [
    "auto repair",
    "car repair",
    "mechanic",
    "tire",
    "oil change",
    "brake",
    "transmission",
    "muffler",
    "auto glass",
  ],
  services: [
    "Oil changes",
    "Brake service",
    "Diagnostics",
    "Tire service",
    "Suspension repair",
    "Engine repair",
    "AC service",
    "Pre-purchase inspections",
  ],
  attributes: [
    "Honest diagnosis",
    "Fair pricing",
    "Fixed right first time",
    "On time",
    "Explained the repair",
    "No upselling",
    "Clean shop",
  ],
  neutralAttributes: ["First visit", "Regular customer", "Short-notice visit"],
  terminology: {
    customer: "customer",
    visit: "service visit",
    staff: "technician",
  },
  promptContext:
    "Practical customer voice on honesty and speed; no invented repairs.",
  phrases: {
    experience5: [
      "they showed me the worn part before replacing it",
      "an honest shop is worth its weight in gold",
      "diagnosed the real problem instead of guessing",
      "the car came back fixed, clean, and on budget",
    ],
    experience4: [
      "fair price and the repair has held up well",
      "good work, the car was ready a bit later than quoted",
      "straightforward diagnosis and no pushy add-ons",
    ],
    closer5: [
      "found my mechanic for life",
      "never taking my car anywhere else",
      "sending my whole family here",
    ],
    closer4: ["would bring my car back", "a trustworthy shop for routine work"],
  },
};

const carDealership: Industry = {
  key: "car_dealership",
  label: "Car Dealership",
  group: "auto",
  googleCategories: ["car dealer", "auto dealer", "dealership", "used car"],
  services: [
    "New vehicle sales",
    "Used vehicle sales",
    "Trade-in appraisals",
    "Financing",
    "Leasing",
    "Service department",
    "Parts department",
    "Test drives",
  ],
  attributes: [
    "No pressure",
    "Straight answers",
    "Fair trade-in",
    "Smooth paperwork",
    "Knowledgeable staff",
    "Respected my budget",
    "Quick process",
  ],
  neutralAttributes: ["First purchase here", "Returning customer", "Just browsing"],
  terminology: { customer: "customer", visit: "visit", staff: "advisor" },
  promptContext:
    "Customer voice on low-pressure help; no invented prices or models.",
  phrases: {
    experience5: [
      "zero pressure from the moment we walked in",
      "they found the exact car we asked for",
      "the paperwork took minutes, not hours",
      "our advisor respected our budget from the start",
    ],
    experience4: [
      "a low-pressure experience and a fair deal",
      "helpful staff and a reasonably quick process",
      "good selection and straight answers on pricing",
    ],
    closer5: [
      "we will buy every car here from now on",
      "already telling friends to ask for our advisor",
      "car buying finally felt good",
    ],
    closer4: ["would shop here again", "worth a look if you are car hunting"],
  },
};

const childcare: Industry = {
  key: "childcare",
  label: "Childcare Center",
  group: "education",
  googleCategories: [
    "child care",
    "childcare",
    "day care",
    "daycare",
    "preschool",
    "montessori",
    "early learning",
  ],
  services: [
    "Infant care",
    "Toddler programs",
    "Preschool programs",
    "Before/after school care",
    "Summer programs",
    "Nutritious meals",
    "Outdoor play",
    "Learning activities",
  ],
  attributes: [
    "Caring educators",
    "Safe and clean",
    "Great communication",
    "Daily updates",
    "My kid loves it",
    "Structured learning",
    "Flexible hours",
  ],
  neutralAttributes: ["New family", "Second child enrolled", "Toured first"],
  terminology: { customer: "parent", visit: "day", staff: "educator" },
  promptContext:
    "Warm parent voice on trust and staff; never name or describe children.",
  phrases: {
    experience5: [
      "my child runs in the door happy every morning",
      "the daily updates make drop-off so much easier",
      "the educators genuinely know and love the kids",
      "clean, organized, and full of laughter",
    ],
    experience4: [
      "a caring, well-run program with good communication",
      "drop-off and pickup are smooth and the staff are warm",
      "happy kid, happy parents, minor waitlist at first",
    ],
    closer5: [
      "we found our village here",
      "enrolling our youngest as soon as there is space",
      "the peace of mind is priceless",
    ],
    closer4: [
      "would recommend to other parents",
      "a solid choice for busy families",
    ],
  },
};

const tutoring: Industry = {
  key: "tutoring",
  label: "Tutoring Center",
  group: "education",
  googleCategories: ["tutor", "learning cent", "test prep"],
  services: [
    "Math tutoring",
    "Reading and writing",
    "Science tutoring",
    "Test prep",
    "Homework help",
    "Study skills",
    "Online sessions",
    "University prep",
  ],
  attributes: [
    "Patient tutors",
    "Real progress",
    "Flexible scheduling",
    "Clear progress updates",
    "Engaging sessions",
    "Confidence boost",
    "Personalized plans",
  ],
  neutralAttributes: ["First month", "Returning student", "Weekly sessions"],
  terminology: { customer: "student", visit: "session", staff: "tutor" },
  promptContext:
    "Parent or student voice on progress; no grade or score guarantees.",
  phrases: {
    experience5: [
      "homework battles have all but disappeared",
      "the tutor makes hard topics feel approachable",
      "confidence is up and it shows at school",
      "sessions are engaging instead of a chore",
    ],
    experience4: [
      "steady progress and easy scheduling",
      "patient tutoring and helpful session recaps",
      "good fit for our learner after a couple of sessions",
    ],
    closer5: [
      "worth every session",
      "we are continuing through the school year",
      "recommending them to other parents at school",
    ],
    closer4: ["would book more sessions", "a helpful boost for tricky subjects"],
  },
};

const gym: Industry = {
  key: "gym",
  label: "Gym",
  group: "fitness",
  googleCategories: [
    "gym",
    "fitness center",
    "health club",
    "athletic club",
    "training facility",
  ],
  services: [
    "Open gym access",
    "Personal training",
    "Group classes",
    "Cardio equipment",
    "Strength training areas",
    "Locker rooms",
    "Fitness assessments",
    "Day passes",
  ],
  attributes: [
    "Clean equipment",
    "Never too crowded",
    "Friendly staff",
    "Great trainers",
    "Good hours",
    "Welcoming vibe",
    "Well maintained",
  ],
  neutralAttributes: ["New member", "Long-time member", "Day pass visit"],
  terminology: { customer: "member", visit: "visit", staff: "trainer" },
  promptContext:
    "Motivated member voice on facility and staff; no body-change claims.",
  phrases: {
    experience5: [
      "the equipment is spotless and never all taken",
      "staff greet you by name at the front desk",
      "the trainers actually watch your form",
      "zero intimidation, just people putting in work",
    ],
    experience4: [
      "clean, well-equipped, and reasonably busy at peak",
      "good machines and helpful staff on the floor",
      "solid gym, the locker room gets busy after work",
    ],
    closer5: [
      "canceled my old membership the same week",
      "this gym makes it easy to show up",
      "my new second home",
    ],
    closer4: ["would keep my membership", "a solid gym for the price"],
  },
};

const fitnessStudio: Industry = {
  key: "fitness_studio",
  label: "Fitness Studio",
  group: "fitness",
  googleCategories: [
    "yoga",
    "pilates",
    "fitness studio",
    "crossfit",
    "barre",
    "spin",
    "cycling studio",
    "bootcamp",
  ],
  services: [
    "Yoga classes",
    "Pilates",
    "Spin classes",
    "HIIT classes",
    "Barre",
    "Small group training",
    "Beginner series",
    "Class packs",
  ],
  attributes: [
    "Motivating instructors",
    "Welcoming community",
    "Great music",
    "Clean studio",
    "All levels welcome",
    "Easy booking app",
    "Classes start on time",
  ],
  neutralAttributes: ["First class", "Regular member", "Drop-in visit"],
  terminology: { customer: "member", visit: "class", staff: "instructor" },
  promptContext:
    "Energized member voice on classes; no fitness-result guarantees.",
  phrases: {
    experience5: [
      "the instructors learn your name by the second class",
      "every class leaves me sweaty and smiling",
      "the community here keeps me coming back",
      "modifications offered for every level, every time",
    ],
    experience4: [
      "great classes, the popular times book up fast",
      "welcoming studio with solid instructors",
      "good energy and a clean space",
    ],
    closer5: [
      "already bought the unlimited pass",
      "this studio rebuilt my routine",
      "dragging all my friends to class with me",
    ],
    closer4: ["would drop in again", "planning to keep a weekly class"],
  },
};

const hotel: Industry = {
  key: "hotel",
  label: "Hotel",
  group: "hospitality",
  googleCategories: [
    "hotel",
    "motel",
    "resort",
    "bed and breakfast",
    "bed & breakfast",
    "guest house",
    "lodging",
    "boutique inn",
  ],
  services: [
    "Guest rooms",
    "Suites",
    "Free breakfast",
    "Airport shuttle",
    "Meeting rooms",
    "Fitness center",
    "Pool",
    "Late checkout",
  ],
  attributes: [
    "Spotless rooms",
    "Comfy beds",
    "Friendly front desk",
    "Quiet at night",
    "Great location",
    "Easy check-in",
    "Good breakfast",
  ],
  neutralAttributes: ["First stay", "Return guest", "Stayed for work"],
  terminology: { customer: "guest", visit: "stay", staff: "team member" },
  promptContext:
    "Traveler voice on comfort and staff; no invented room types or rates.",
  phrases: {
    experience5: [
      "the bed was so comfortable I overslept happily",
      "the front desk remembered my name all weekend",
      "spotless room, quiet floor, easy checkout",
      "little touches everywhere that show they care",
    ],
    experience4: [
      "clean room and a friendly check-in",
      "comfortable stay, elevator wait was a bit long",
      "good location and a quiet night's sleep",
    ],
    closer5: [
      "this is where we stay every trip now",
      "already booked our next weekend here",
      "the only place we will stay in town",
    ],
    closer4: ["would stay here again", "a reliable pick for a night in town"],
  },
};

const eventVenue: Industry = {
  key: "event_venue",
  label: "Event Venue",
  group: "hospitality",
  googleCategories: [
    "event venue",
    "banquet",
    "wedding venue",
    "event space",
    "conference center",
    "reception hall",
  ],
  services: [
    "Wedding receptions",
    "Corporate events",
    "Banquet packages",
    "Catering coordination",
    "AV equipment",
    "Event planning support",
    "Outdoor ceremony space",
    "Bar service",
  ],
  attributes: [
    "Stunning space",
    "Organized coordinators",
    "Flexible packages",
    "Smooth event day",
    "Great value",
    "Responsive planning team",
    "Handled every detail",
  ],
  neutralAttributes: ["Hosted our first event", "Toured venues first", "Attended as a guest"],
  terminology: { customer: "client", visit: "event", staff: "coordinator" },
  promptContext:
    "Host voice on the event day and staff; no invented event specifics.",
  phrases: {
    experience5: [
      "our guests are still talking about the venue",
      "the coordinator handled every detail flawlessly",
      "the space photographed beautifully all night",
      "setup and teardown happened like magic",
    ],
    experience4: [
      "a smooth event with responsive staff",
      "lovely space, parking filled up quickly",
      "planning was easy and the day ran on time",
    ],
    closer5: [
      "we would book this venue all over again",
      "recommending it to every engaged couple we know",
      "the day was everything we hoped for",
    ],
    closer4: [
      "would host here again",
      "worth a tour if you are venue hunting",
    ],
  },
};

const photography: Industry = {
  key: "photography",
  label: "Photography Studio",
  group: "other",
  googleCategories: ["photograph", "photo studio", "portrait"],
  services: [
    "Family portraits",
    "Weddings",
    "Newborn sessions",
    "Headshots",
    "Engagement shoots",
    "Event photography",
    "Product photography",
    "Photo prints",
  ],
  attributes: [
    "Photos I treasure",
    "Made us comfortable",
    "Quick turnaround",
    "Great direction",
    "Beautiful editing",
    "Easy scheduling",
    "Fair packages",
  ],
  neutralAttributes: ["First session", "Returning client", "Event booking"],
  terminology: { customer: "client", visit: "session", staff: "photographer" },
  promptContext:
    "Delighted client voice on the photos; no invented shoot details.",
  phrases: {
    experience5: [
      "they caught moments we did not even know happened",
      "the gallery made me cry in the best way",
      "posing felt natural, never stiff or awkward",
      "the edited photos came back faster than promised",
    ],
    experience4: [
      "lovely photos and an easy, relaxed session",
      "good direction for a camera-shy family",
      "the gallery arrived on schedule and looks great",
    ],
    closer5: [
      "booking them for every milestone from now on",
      "our walls are covered in their work",
      "worth every penny for these memories",
    ],
    closer4: [
      "would book another session",
      "happy to recommend for family photos",
    ],
  },
};

const retailStore: Industry = {
  key: "retail_store",
  label: "Retail Store",
  group: "retail",
  googleCategories: ["store", "shop", "boutique", "retail", "market"],
  services: [
    "In-store shopping",
    "Online ordering",
    "Curbside pickup",
    "Gift wrapping",
    "Returns and exchanges",
    "Special orders",
    "Gift cards",
    "Loyalty program",
  ],
  attributes: [
    "Great selection",
    "Helpful staff",
    "Fair prices",
    "Easy returns",
    "Well organized",
    "Unique finds",
    "No-pressure browsing",
  ],
  neutralAttributes: ["First visit", "Regular shopper", "Just browsing"],
  terminology: { customer: "customer", visit: "visit", staff: "associate" },
  promptContext:
    "Shopper voice on selection and help; no invented products or prices.",
  phrases: {
    experience5: [
      "found things here I have never seen anywhere else",
      "the staff helped without hovering",
      "beautifully organized and a joy to browse",
      "checkout was quick and the wrapping was lovely",
    ],
    experience4: [
      "nice selection and helpful staff",
      "found what I needed at a fair price",
      "pleasant browsing, a couple sizes were sold out",
    ],
    closer5: [
      "my first stop for every gift now",
      "I always leave with something great",
      "supporting this shop every chance I get",
    ],
    closer4: ["would shop here again", "worth a browse when you are nearby"],
  },
};

/**
 * Generic professional-services entry. Also the base for `getIndustry`'s
 * unknown-key fallback, so keep its content broadly applicable.
 */
export const PROFESSIONAL_SERVICES_INDUSTRY: Industry = {
  key: "professional_services",
  label: "Professional Services",
  group: "professional",
  googleCategories: [
    "consultant",
    "consulting",
    "professional service",
    "business service",
    "agency",
  ],
  services: [
    "Consulting",
    "Project work",
    "Strategy sessions",
    "Ongoing support",
    "Assessments",
    "Implementation",
    "Training",
    "Custom engagements",
  ],
  attributes: [
    "Professional team",
    "Clear communication",
    "Delivered on time",
    "Fair pricing",
    "Knowledgeable",
    "Responsive",
    "Easy to work with",
  ],
  neutralAttributes: ["First engagement", "Repeat client", "Colleague referral"],
  terminology: { customer: "client", visit: "engagement", staff: "consultant" },
  promptContext:
    "Client voice on professionalism; no invented deliverables or results.",
  phrases: {
    experience5: [
      "they delivered exactly what was promised, on time",
      "communication was proactive from kickoff to wrap-up",
      "deep expertise without the jargon",
      "they treated our project like their own",
    ],
    experience4: [
      "professional, responsive, and organized",
      "solid work delivered close to the original timeline",
      "clear scope, fair price, good result",
    ],
    closer5: [
      "already scoping the next engagement with them",
      "our first call for this kind of work",
      "recommending them to other business owners",
    ],
    closer4: ["would engage them again", "a dependable partner for future work"],
  },
};

export const INDUSTRY_CATALOG: readonly Industry[] = [
  restaurant,
  cafe,
  bakery,
  salon,
  barber,
  spa,
  physiotherapy,
  dental,
  medicalClinic,
  chiropractic,
  pharmacy,
  generalContractor,
  renovation,
  roofing,
  plumbing,
  electrician,
  hvac,
  cleaning,
  moving,
  realEstate,
  mortgageBroker,
  insuranceAgency,
  immigrationConsultant,
  lawFirm,
  accounting,
  autoRepair,
  carDealership,
  childcare,
  tutoring,
  gym,
  fitnessStudio,
  hotel,
  eventVenue,
  photography,
  retailStore,
  PROFESSIONAL_SERVICES_INDUSTRY,
];
