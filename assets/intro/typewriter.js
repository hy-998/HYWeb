/* ============================================================
   typewriter-effect 的等价实现（按线上 home-COunAWbt.js 中的
   Typewriter 类逐条还原：事件队列 + requestAnimationFrame 时序）
   —— 不加任何额外的缓动或批处理，保持与原站逐帧一致
   ============================================================ */

const TYPE_CHARACTER = "TYPE_CHARACTER";
const REMOVE_CHARACTER = "REMOVE_CHARACTER";
const REMOVE_ALL = "REMOVE_ALL";
const REMOVE_LAST_VISIBLE_NODE = "REMOVE_LAST_VISIBLE_NODE";
const PAUSE_FOR = "PAUSE_FOR";
const CALL_FUNCTION = "CALL_FUNCTION";
const ADD_HTML_TAG_ELEMENT = "ADD_HTML_TAG_ELEMENT";
const CHANGE_DELETE_SPEED = "CHANGE_DELETE_SPEED";
const CHANGE_DELAY = "CHANGE_DELAY";
const CHANGE_CURSOR = "CHANGE_CURSOR";
const PASTE_STRING = "PASTE_STRING";
const HTML_TAG = "HTML_TAG";

const isHTMLString = (str) => /<[a-z][\s\S]*>/i.test(str);
const randomInRange = (min, max) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

class Typewriter {
  constructor(container, options) {
    this.state = {
      cursorAnimation: null,
      lastFrameTime: null,
      pauseUntil: null,
      eventQueue: [],
      eventLoop: null,
      eventLoopPaused: false,
      reverseCalledEvents: [],
      calledEvents: [],
      visibleNodes: [],
      initialOptions: null,
      elements: {
        container: null,
        wrapper: document.createElement("span"),
        cursor: document.createElement("span"),
      },
    };

    this.options = {
      strings: null,
      cursor: "|",
      delay: "natural",
      pauseFor: 1500,
      deleteSpeed: "natural",
      loop: false,
      autoStart: false,
      devMode: false,
      skipAddStyles: false,
      wrapperClassName: "Typewriter__wrapper",
      cursorClassName: "Typewriter__cursor",
      stringSplitter: null,
      onCreateTextNode: null,
      onRemoveNode: null,
    };

    if (typeof container === "string") {
      const el = document.querySelector(container);
      if (!el) throw new Error("Could not find container element");
      this.state.elements.container = el;
    } else {
      this.state.elements.container = container;
    }

    if (options) this.options = Object.assign({}, this.options, options);
    this.state.initialOptions = Object.assign({}, this.options);

    this.runEventLoop = this.runEventLoop.bind(this);
    this.init();
  }

  init() {
    this.setupWrapperElement();
    // 与原实现一致：CHANGE_CURSOR 与 REMOVE_ALL 以 unshift 方式置入队首
    this.addEventToQueue(CHANGE_CURSOR, { cursor: this.options.cursor }, true);
    this.addEventToQueue(REMOVE_ALL, null, true);

    if (!window.___TYPEWRITER_JS_STYLES_ADDED___ && !this.options.skipAddStyles) {
      const css =
        ".Typewriter__cursor{-webkit-animation:Typewriter-cursor 1s infinite;" +
        "animation:Typewriter-cursor 1s infinite;margin-left:1px}" +
        "@-webkit-keyframes Typewriter-cursor{0%{opacity:0}50%{opacity:1}100%{opacity:0}}" +
        "@keyframes Typewriter-cursor{0%{opacity:0}50%{opacity:1}100%{opacity:0}}";
      const style = document.createElement("style");
      style.appendChild(document.createTextNode(css));
      document.head.appendChild(style);
      window.___TYPEWRITER_JS_STYLES_ADDED___ = true;
    }
  }

  setupWrapperElement() {
    if (!this.state.elements.container) return;
    const { wrapper, cursor } = this.state.elements;
    wrapper.className = this.options.wrapperClassName;
    cursor.className = this.options.cursorClassName;
    cursor.innerHTML = this.options.cursor;
    this.state.elements.container.innerHTML = "";
    this.state.elements.container.appendChild(wrapper);
    this.state.elements.container.appendChild(cursor);
  }

  addEventToQueue(eventName, eventArgs, front) {
    return this.addEventToStateProperty(eventName, eventArgs, front, "eventQueue");
  }

  addEventToStateProperty(eventName, eventArgs, front, key) {
    const event = { eventName, eventArgs: eventArgs || {} };
    const target = this.state[key];
    this.state[key] = front ? [event].concat(target) : target.concat([event]);
    return this;
  }

  /* ---------- 指令 ---------- */

  typeString(str, node = null) {
    if (isHTMLString(str)) return this.typeOutHTMLString(str, node);
    if (str) {
      const splitter = this.options.stringSplitter;
      const chars = typeof splitter === "function" ? splitter(str) : str.split("");
      this.typeCharacters(chars, node);
    }
    return this;
  }

  pasteString(str, node = null) {
    if (isHTMLString(str)) return this.typeOutHTMLString(str, node, true);
    if (str) this.addEventToQueue(PASTE_STRING, { character: str, node });
    return this;
  }

  typeOutHTMLString(str, parentNode = null, paste = false) {
    const holder = document.createElement("div");
    holder.innerHTML = str;
    const nodes = holder.childNodes;

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const html = node.innerHTML;
      if (node && node.nodeType !== 3) {
        node.innerHTML = "";
        this.addEventToQueue(ADD_HTML_TAG_ELEMENT, { node, parentNode });
        paste ? this.pasteString(html, node) : this.typeString(html, node);
      } else if (node.textContent) {
        paste
          ? this.pasteString(node.textContent, parentNode)
          : this.typeString(node.textContent, parentNode);
      }
    }
    return this;
  }

  typeCharacters(chars, node = null) {
    if (!chars || !Array.isArray(chars))
      throw new Error("Characters must be an array");
    chars.forEach((character) =>
      this.addEventToQueue(TYPE_CHARACTER, { character, node })
    );
    return this;
  }

  removeCharacters(amount) {
    for (let i = 0; i < amount; i++) this.addEventToQueue(REMOVE_CHARACTER);
    return this;
  }

  deleteAll(speed = "natural") {
    return this.addEventToQueue(REMOVE_ALL, { speed });
  }

  changeDeleteSpeed(speed) {
    if (!speed) throw new Error("Must provide new delete speed");
    return this.addEventToQueue(CHANGE_DELETE_SPEED, { speed });
  }

  changeDelay(delay) {
    if (!delay) throw new Error("Must provide new delay");
    return this.addEventToQueue(CHANGE_DELAY, { delay });
  }

  changeCursor(cursor) {
    if (!cursor) throw new Error("Must provide new cursor");
    return this.addEventToQueue(CHANGE_CURSOR, { cursor });
  }

  pauseFor(ms) {
    return this.addEventToQueue(PAUSE_FOR, { ms });
  }

  callFunction(cb, thisArg) {
    if (!cb || typeof cb !== "function")
      throw new Error("Callback must be a function");
    return this.addEventToQueue(CALL_FUNCTION, { cb, thisArg });
  }

  start() {
    this.state.eventLoopPaused = false;
    return this.runEventLoop();
  }

  stop() {
    this.state.eventLoopPaused = true;
    if (this.state.eventLoop) cancelAnimationFrame(this.state.eventLoop);
    return this;
  }

  /* ---------- 事件循环 ---------- */

  runEventLoop() {
    if (!this.state.lastFrameTime) this.state.lastFrameTime = Date.now();
    const now = Date.now();
    const elapsed = now - this.state.lastFrameTime;

    if (!this.state.eventQueue.length) {
      if (!this.options.loop) return;
      this.state.eventQueue = this.state.calledEvents.slice();
      this.state.calledEvents = [];
      this.options = Object.assign({}, this.state.initialOptions);
    }

    this.state.eventLoop = requestAnimationFrame(this.runEventLoop);

    if (!this.state.eventLoopPaused) {
      if (this.state.pauseUntil) {
        if (now < this.state.pauseUntil) return;
        this.state.pauseUntil = null;
      }

      const queue = this.state.eventQueue.slice();
      const current = queue.shift();

      const delay =
        current.eventName === REMOVE_LAST_VISIBLE_NODE ||
        current.eventName === REMOVE_CHARACTER
          ? this.options.deleteSpeed === "natural"
            ? randomInRange(40, 80)
            : this.options.deleteSpeed
          : this.options.delay === "natural"
          ? randomInRange(120, 160)
          : this.options.delay;

      if (!(elapsed <= delay)) {
        const name = current.eventName;
        const args = current.eventArgs;

        switch (name) {
          case PASTE_STRING:
          case TYPE_CHARACTER: {
            const textNode = document.createTextNode(args.character);
            let node = textNode;
            if (typeof this.options.onCreateTextNode === "function") {
              node = this.options.onCreateTextNode(args.character, textNode);
            }
            if (node) {
              if (args.node) args.node.appendChild(node);
              else this.state.elements.wrapper.appendChild(node);
            }
            this.state.visibleNodes = this.state.visibleNodes.concat([
              { type: "TEXT_NODE", character: args.character, node: textNode },
            ]);
            break;
          }
          case REMOVE_CHARACTER:
            queue.unshift({
              eventName: REMOVE_LAST_VISIBLE_NODE,
              eventArgs: { removingCharacterNode: true },
            });
            break;
          case PAUSE_FOR:
            this.state.pauseUntil = Date.now() + parseInt(args.ms, 10);
            break;
          case CALL_FUNCTION:
            args.cb.call(args.thisArg, { elements: this.state.elements });
            break;
          case ADD_HTML_TAG_ELEMENT: {
            const { node, parentNode } = args;
            if (parentNode) parentNode.appendChild(node);
            else this.state.elements.wrapper.appendChild(node);
            this.state.visibleNodes = this.state.visibleNodes.concat([
              {
                type: HTML_TAG,
                node,
                parentNode: parentNode || this.state.elements.wrapper,
              },
            ]);
            break;
          }
          case REMOVE_ALL: {
            const speed = args.speed;
            const events = [];
            if (speed) events.push({ eventName: CHANGE_DELETE_SPEED, eventArgs: { speed, temp: true } });
            for (let i = 0; i < this.state.visibleNodes.length; i++) {
              events.push({
                eventName: REMOVE_LAST_VISIBLE_NODE,
                eventArgs: { removingCharacterNode: false },
              });
            }
            if (speed)
              events.push({
                eventName: CHANGE_DELETE_SPEED,
                eventArgs: { speed: this.options.deleteSpeed, temp: true },
              });
            queue.unshift(...events);
            break;
          }
          case REMOVE_LAST_VISIBLE_NODE: {
            const removingCharacterNode = args.removingCharacterNode;
            if (this.state.visibleNodes.length) {
              const { type, node, character } = this.state.visibleNodes.pop();
              if (typeof this.options.onRemoveNode === "function") {
                this.options.onRemoveNode({ node, character });
              }
              if (node && node.parentNode) node.parentNode.removeChild(node);
              if (type === HTML_TAG && removingCharacterNode) {
                queue.unshift({ eventName: REMOVE_LAST_VISIBLE_NODE, eventArgs: {} });
              }
            }
            break;
          }
          case CHANGE_DELETE_SPEED:
            this.options.deleteSpeed = args.speed;
            break;
          case CHANGE_DELAY:
            this.options.delay = args.delay;
            break;
          case CHANGE_CURSOR:
            this.options.cursor = args.cursor;
            this.state.elements.cursor.innerHTML = args.cursor;
            break;
          default:
            break;
        }

        if (this.options.loop) {
          this.state.calledEvents = this.state.calledEvents.concat([current]);
        }

        this.state.eventQueue = queue;
        this.state.lastFrameTime = now;
      }
    }
  }
}
