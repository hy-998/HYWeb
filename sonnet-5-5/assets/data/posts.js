/* claude.dev post data, read from the page's own payload and markup.
   Consumed by clone.js for the filter tabs, the LOAD MORE list and the ⌘K
   palette search.

   allOrder is the full newest-first sequence used by the related feed and its
   category tabs, with the current article excluded. The first five entries are
   the rows the page renders up front, taken from the rendered feed; the rest
   follow the payload's order. */
window.__CLONE_POSTS__ = {
  current: "building-with-claude-sonnet-5-5",
  relatedLimit: 5,
  allOrder: [
  "automating-eval-design-and-hillclimbing",
  "building-with-claude-sonnet-5-5",
  "spending-your-effort",
  "what-a-task-costs-on-opus-5-5",
  "how-we-made-claude-ai-faster",
  "getting-the-most-out-of-opus-5-5",
  "the-new-rules-of-context-engineering-for-claude-5-generation-models",
  "lessons-from-building-claude-code-how-we-use-skills",
  "a-harness-for-every-task-dynamic-workflows-in-claude-code",
  "using-claude-code-the-unreasonable-effectiveness-of-html",
  "lessons-from-building-claude-code-prompt-caching-is-everything",
  "seeing-like-an-agent"
],
  posts: [
  {
    "slug": "building-with-claude-sonnet-5-5",
    "title": "Building with Claude Sonnet 5.5",
    "cat": "Playbooks",
    "date": "2026-09-28",
    "mins": 9
  },
  {
    "slug": "automating-eval-design-and-hillclimbing",
    "title": "Automating eval design and hillclimbing with Claude",
    "cat": "Playbooks",
    "date": "2026-09-28",
    "mins": 12
  },
  {
    "slug": "what-a-task-costs-on-opus-5-5",
    "title": "What a task costs on Opus 5.5",
    "cat": "Playbooks",
    "date": "2026-09-25",
    "mins": 21
  },
  {
    "slug": "spending-your-effort",
    "title": "Using Claude Code: Spending your effort",
    "cat": "Engineering",
    "date": "2026-09-25",
    "mins": 8
  },
  {
    "slug": "how-we-made-claude-ai-faster",
    "title": "How we made claude.ai 3x faster in two weeks",
    "cat": "Engineering",
    "date": "2026-09-23",
    "mins": 15
  },
  {
    "slug": "getting-the-most-out-of-opus-5-5",
    "title": "Getting the most out of Opus 5.5 in Claude and Claude Code",
    "cat": "Playbooks",
    "date": "2026-09-22",
    "mins": 9
  },
  {
    "slug": "the-new-rules-of-context-engineering-for-claude-5-generation-models",
    "title": "The new rules of context engineering for Claude 5 generation models",
    "cat": "Engineering",
    "date": "2026-07-24",
    "mins": 7
  },
  {
    "slug": "lessons-from-building-claude-code-how-we-use-skills",
    "title": "Lessons from building Claude Code: How we use skills",
    "cat": "Skills",
    "date": "2026-06-03",
    "mins": 11
  },
  {
    "slug": "a-harness-for-every-task-dynamic-workflows-in-claude-code",
    "title": "A harness for every task: dynamic workflows in Claude Code",
    "cat": "Agents",
    "date": "2026-06-02",
    "mins": 11
  },
  {
    "slug": "using-claude-code-the-unreasonable-effectiveness-of-html",
    "title": "Using Claude Code: The unreasonable effectiveness of HTML",
    "cat": "Playbooks",
    "date": "2026-05-20",
    "mins": 9
  },
  {
    "slug": "lessons-from-building-claude-code-prompt-caching-is-everything",
    "title": "Lessons from building Claude Code: Prompt caching is everything",
    "cat": "Engineering",
    "date": "2026-04-30",
    "mins": 6
  },
  {
    "slug": "seeing-like-an-agent",
    "title": "Seeing like an agent: how we design tools in Claude Code",
    "cat": "Agents",
    "date": "2026-04-10",
    "mins": 7
  }
],
};
