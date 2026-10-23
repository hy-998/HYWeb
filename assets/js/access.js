/* ============================================================
   简历页门禁 —— assets/js/access.js
   ------------------------------------------------------------
   只做一件事：没有钥匙的人看不到简历页，站内也找不到简历页。

   钥匙挂在链接的 ?k= 上。校验通过 → 写 sessionStorage（关掉标签即失效，
   公共电脑上下一个人接手时不再解锁）→ 再用 replaceState 把钥匙从地址栏
   抹掉，此后复制、分享、跳转都不带钥匙。
   没有钥匙也没有标记 → location.replace 回 index.html，且这段跑在
   <head> 里同步执行，简历内容根本不渲染，不会闪一下。

   边界（务必知道）：这是「发现性隔离」，不是访问控制。仓库与 Pages 都是
   公开的，知道 /about.html 这个路径、或直接读这个文件的人依然进得来。
   要真正的隐私，得把页面挪出公开仓库，或改成内容加密 + 钥匙放 # 片段。
   ============================================================ */
(function () {
  var KEY = 'SsIU9mi1NBV4';
  var FLAG = 'aboutAccess'; /* clone.js 第 10 节读同一个标记来决定要不要注入「关于」页签 */

  var allowed = false;
  var m = /[?&]k=([^&#]+)/.exec(location.search);
  if (m && m[1] === KEY) {
    allowed = true; /* 内存里先认下来：存储被禁用的浏览器也能看完这一页 */
    try { sessionStorage.setItem(FLAG, '1'); } catch (e) {}
    /* 地址栏只留干净路径：钥匙不进历史、不进复制分享、也不给外部站。
       file:// 下 replaceState 可能被同源策略挡下来，挡了也只是地址栏难看，
       不能让它把放行流程打断，所以整段包 try。 */
    try { if (history.replaceState) history.replaceState(null, '', location.pathname); } catch (e) {}
  }
  if (!allowed) {
    try { allowed = sessionStorage.getItem(FLAG) === '1'; } catch (e) {}
  }
  if (allowed) {
    /* 放行才揭开整页。about.css 第 0 节默认把 body 藏起来，
       所以关掉 JavaScript 的人同样读不到简历——门禁不依赖脚本之外的东西。 */
    document.documentElement.classList.add('about-ok');
  } else {
    location.replace('index.html');
  }
})();
