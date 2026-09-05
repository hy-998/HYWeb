/* ============================================================
   博客开篇（intro.html）交互 —— 中文版
   —— 字体：零加载系统楷体栈（KaiTi / STKaiti），无任何 webfont；
      节奏：全程匀速 60ms/字，无末段放慢
   ============================================================ */

const mainContent = document.querySelector(".main-content");
const typewriterHost = document.getElementById("typewriter");
const cta = document.querySelector(".cta-wrap");
const themeToggle = document.querySelector(".theme-toggle");

const scrollToBottom = () => {
  window.scrollTo({
    top: document.documentElement.scrollHeight,
    behavior: "smooth",
  });
};

/* 进入博客主界面（记录"开篇已播过"，之后直接进主界面） */
function enterBlog() {
  try { localStorage.setItem("introPlayed", "1"); } catch (e) {}
  window.location.href = "index.html";
}

function runIntro() {
  const tw = new Typewriter(typewriterHost, { delay: 60 });

  /* 换行不做任何停顿，光标跟随文字直接跳过空行 */
  tw.pauseFor(500)
    .typeString("在 AI 时代，")
    .typeString("<br />信息的搬运与生产")
    .typeString("<br />变得极其容易。")
    .typeString("<br /><br />")
    .typeString("但关键在于")
    .callFunction(scrollToBottom)
    .typeString("<br />一个人需要关注什么？")
    .typeString("<br /><br />")
    .callFunction(scrollToBottom)
    .typeString("<strong>所以我制作了这个博客。</strong>")
    .typeString("<br />个人履历、AI 使用经验、所做的项目，")
    .typeString("<br />都放在这里。")
    .callFunction(scrollToBottom)
    .start();

  return tw;
}

let instance = runIntro();

/* Enter 按钮 & 主题切换按钮淡入（transition-opacity delay-500 duration-700） */
requestAnimationFrame(() => {
  cta.classList.add("is-visible");
  themeToggle.classList.add("is-visible");
});

/* 主题切换：与博客 clone.js 保持一致，'theme' 存 localStorage */
themeToggle.addEventListener("click", function () {
  const root = document.documentElement;
  const next = root.classList.contains("dark") ? "light" : "dark";
  root.classList.remove("light", "dark");
  root.classList.add(next);
  try { localStorage.setItem("theme", next); } catch (e) {}
});

/* Enter 按钮 & 键盘 Enter → 进入博客主界面 */
document.getElementById("enterBtn").addEventListener("click", function (e) {
  e.preventDefault();
  enterBlog();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    enterBlog();
  }
});

/* 点击顶部 Logo 重播开头（阻止 href="#" 造成的跳转） */
function replay() {
  instance.stop();
  instance = runIntro();
}
document.querySelector(".logo").addEventListener("click", function (e) {
  e.preventDefault();
  replay();
});
