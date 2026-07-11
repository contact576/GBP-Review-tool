export interface ArticleSection {
  heading: string;
  paragraphs: string[];
}

export interface Article {
  slug: string;
  category: string;
  title: string;
  dek: string;
  readMins: number;
  updated: string;
  takeaways: string[];
  sections: ArticleSection[];
}

export const ARTICLES: Article[] = [
  {
    slug: "ai-search-local-business",
    category: "AEO",
    title: "AI search is rewriting how customers find local businesses",
    dek: "Fewer people scroll ten blue links. More ask an assistant for one answer. Here's what that means for your storefront.",
    readMins: 6,
    updated: "2026-05-14",
    takeaways: [
      "Answer engines return one recommendation, not a page of options.",
      "Reviews and a complete profile are the strongest signals for being named.",
      "Track whether AI names you — then close the gap deliberately.",
    ],
    sections: [
      {
        heading: "From a list of links to a single answer",
        paragraphs: [
          "For twenty years, being found locally meant ranking somewhere on the first page of results. A customer scanned the options, opened a few, and decided. That behavior is changing fast. When someone asks an AI assistant for \"the best physiotherapist near me,\" they increasingly get one confident recommendation instead of a list to sift through.",
          "That shift raises the stakes. Ranking fourth used to still earn clicks. Being the second-best answer an assistant considers often earns nothing at all. The winners are the businesses the model is confident enough to name.",
        ],
      },
      {
        heading: "What answer engines actually weigh",
        paragraphs: [
          "Answer engines synthesize from the same public signals that power local search: your Google Business Profile, the volume and recency of your reviews, your rating, and how consistently your information appears across the web. A profile that's complete, active, and backed by a steady stream of recent reviews reads as trustworthy — and trustworthy is what gets recommended.",
          "The businesses that struggle are the ones with a stale profile and a pile of old reviews. To a model, silence looks like risk.",
        ],
      },
      {
        heading: "Measure it, then close the gap",
        paragraphs: [
          "You can't improve what you can't see. The first move is simply to ask the questions your customers ask and record whether you're named, and which competitors are named instead. Foundly tracks this automatically and turns each miss into a specific action — the review, photo, or profile update most likely to change the answer.",
        ],
      },
    ],
  },
  {
    slug: "google-review-velocity",
    category: "Reviews",
    title: "Why review velocity beats review count",
    dek: "A hundred reviews from three years ago say less than ten from last month. Recency is the signal that moves rank.",
    readMins: 5,
    updated: "2026-04-30",
    takeaways: [
      "A steady, recent flow signals an active, trusted business.",
      "Ask at the moment of peak goodwill, not days later.",
      "Durable reviews — ones that survive filtering — are the only ones that count.",
    ],
    sections: [
      {
        heading: "Recency is a living signal",
        paragraphs: [
          "Review count feels like the scoreboard, but it's a lagging one. A business with 200 reviews and nothing in the last six months looks like it might have coasted — or closed. A competitor posting a handful of fresh reviews every week looks alive, busy, and worth choosing. Both search rank and AI recommendations lean on that liveness.",
          "This is why velocity — the rate of new reviews over time — often predicts growth better than the raw total.",
        ],
      },
      {
        heading: "The moment matters more than the message",
        paragraphs: [
          "The single biggest lever on velocity is timing. Goodwill peaks right after a great experience and fades within hours. A request sent at checkout converts far better than one sent three days later by email. That's why the most effective flow puts the ask in the hands of the staff member who just delivered the service — one tap, at the peak.",
        ],
      },
      {
        heading: "Count only what survives",
        paragraphs: [
          "Not every posted review sticks. Platforms filter some automatically, and a review that vanishes after a week did nothing for you. Measuring velocity honestly means watching reviews over 30 and 60 days and counting the ones that survive. Foundly's durability watchdog does exactly this, so your numbers reflect reality rather than a good first day.",
        ],
      },
    ],
  },
  {
    slug: "aeo-guide",
    category: "Guide",
    title: "The practical AEO guide for local businesses",
    dek: "Answer Engine Optimization, minus the jargon. A field guide to getting named when customers ask an AI.",
    readMins: 8,
    updated: "2026-06-02",
    takeaways: [
      "AEO is earning the recommendation, not gaming a ranking.",
      "Complete profile, durable reviews, consistent info: the fundamentals compound.",
      "Review the answers monthly and act on the misses.",
    ],
    sections: [
      {
        heading: "What AEO really means",
        paragraphs: [
          "Answer Engine Optimization is the practice of making your business the one an AI assistant names when someone asks for a recommendation. It isn't a trick or a keyword game. It's making the underlying signals so clearly trustworthy that a model is comfortable putting your name in a one-line answer.",
          "In practice, that overlaps heavily with good local marketing — which is encouraging, because it means the work you'd do anyway pays off twice.",
        ],
      },
      {
        heading: "The fundamentals that compound",
        paragraphs: [
          "Start with a complete, accurate Google Business Profile: correct category, full services with descriptions, recent photos, and current hours. Add a steady flow of recent, durable reviews that mention specifics — the service, the person, the outcome. Keep your name, address, and phone identical everywhere they appear. None of these is dramatic on its own; together they compound into the trust an answer engine needs.",
        ],
      },
      {
        heading: "A simple monthly loop",
        paragraphs: [
          "Once a month, ask the assistant the five questions your best customers would ask. Note where you're named and where a competitor is named instead. For each miss, take the one action most likely to change it — usually a fresh review or a profile gap to fill. Repeat. Over a few cycles, the answer starts to include you more often, and the effort stays small because you're always acting on the single highest-leverage fix.",
        ],
      },
    ],
  },
  {
    slug: "review-requests-that-convert",
    category: "Reviews",
    title: "How to ask for reviews without being awkward",
    dek: "The best request feels like a favor between people, not a marketing blast. A few rules that keep it human.",
    readMins: 4,
    updated: "2026-03-18",
    takeaways: [
      "Ask in person or from the person who did the work.",
      "Make it one tap, and never reward or incentivize a review.",
      "Give an honest private path for unhappy customers.",
    ],
    sections: [
      {
        heading: "Make it personal, make it easy",
        paragraphs: [
          "A review request lands best when it comes from the human who delivered the service and points to a single, obvious next tap. The more steps between the customer and the review box, the more drop-off. A short, warm message with one link beats a polished email campaign nearly every time.",
        ],
      },
      {
        heading: "Stay on the right side of the rules",
        paragraphs: [
          "Never offer a discount, entry, or gift in exchange for a review — it violates Google's policies and erodes trust. Ask everyone the same way, whether you expect five stars or not. And always give unhappy customers a genuine private channel to reach the owner, so their feedback improves the business instead of just landing in public.",
        ],
      },
    ],
  },
];

export function getArticle(slug: string): Article | undefined {
  return ARTICLES.find((a) => a.slug === slug);
}
