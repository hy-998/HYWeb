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

/* 校验 clone.js 传来的 ?next=：只接受本站同目录下的单个 .html 文件
   （可带 query/hash）。拒绝协议、绝对路径、协议相对地址、反斜杠、
   `..` 穿越与 intro.html 自身，避免被构造成开放重定向或自我循环。 */
function safeNext(raw) {
  if (!raw) return "";
  const s = String(raw);
  if (!/^[\w.-]+\.html(?:[?#]\S*)?$/i.test(s)) return "";
  if (s.indexOf("..") !== -1) return "";
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|\\|\/)/i.test(s)) return "";
  if (/^intro\.html(?:[?#]|$)/i.test(s)) return "";
  return s;
}

function readNext() {
  let raw = "";
  try {
    raw = new URLSearchParams(window.location.search).get("next") || "";
  } catch (e) {
    return "";
  }
  return safeNext(raw);
}

/* 进入博客主界面（记录"开篇已播过"，之后直接进主界面。
   带 ?next= 时回到用户首访时想看的页面；无 next 或校验不通过则回主页。
   存储被禁用时 setItem 会抛错，此处吞掉即可——标记写不上不应挡住进入） */
function enterBlog() {
  try { localStorage.setItem("introPlayed", "1"); } catch (e) {}
  window.location.href = readNext() || "index.html";
}

function runIntro() {
  const tw = new Typewriter(typewriterHost, { delay: 60 });

  /* 换行不做任何停顿，光标跟随文字直接跳过空行 */
  tw.pauseFor(500)
    .typeString("V4.1 Flash 的发布，")
    .typeString("<br />它的速度和普惠的智能，")
    .typeString("<br />让我恍惚间走进了下一个时代。")
    .typeString("<br /><br />")
    .typeString("智能曾是 GPT-3.5 时代的珍宝，")
    .callFunction(scrollToBottom)
    .typeString("<br />如今成了奔流时代的自来水。")
    .typeString("<br /><br />")
    .typeString("人的一句话像言出法随的咒语，")
    .callFunction(scrollToBottom)
    .typeString("<br />创造、判断好像都变得廉价。")
    .typeString("<br /><br />")
    .typeString("当大多数人可以拥有")
    .typeString("<br />最顶级智能的时候，")
    .callFunction(scrollToBottom)
    .typeString("<br /><strong>什么是属于他自己的事情呢？</strong>")
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
