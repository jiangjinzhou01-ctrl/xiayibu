# 下一步 · 求职行动工作台

一个面向中国大陆求职者的免费静态网页。把求职目标拆成具体行动：确定方向、对照真实岗位要求、整理简历、追踪投递进度、识别常见招聘风险，并跳转到公共就业资源。

## 直接使用

打开 `index.html` 即可使用；无需安装、注册、API Key 或服务器。建议通过 HTTPS 网站访问，以使用剪贴板等浏览器功能。

数据默认只保存在当前浏览器的 `localStorage`。右上角「数据与设置」可导出或导入完整 JSON 备份；投递记录也可导出 CSV。清除浏览器数据或换设备前请先备份。风险检查的原始文本只在当前页面临时处理。

## 发布到 GitHub Pages

本项目的所有文件放在仓库根目录，保留相对路径。

1. 在 GitHub 新建一个 **Public** 仓库（例如 `xiayibu`）。
2. 上传 `index.html`、`styles.css`、`app.js`、`icon.svg`、`.nojekyll`、`README.md` 到仓库根目录，并提交到 `main`。
3. 打开仓库的 **Settings → Pages**，在 **Build and deployment** 中选择 **Deploy from a branch**，分支选择 `main`、目录选择 `/ (root)`，保存。
4. 等待 Pages 部署完成。页面地址通常为 `https://<用户名>.github.io/<仓库名>/`；以 GitHub 页面显示的实际地址为准。

后续更新上述文件并提交到 `main`，Pages 会重新发布。页面只使用相对资源路径，兼容项目仓库的子路径。

### 手机操作

手机浏览器打开 GitHub 仓库，选择 **Add file → Upload files** 上传解压后的文件；如移动页面隐藏此操作，可切换浏览器的桌面版网站。也可以在 GitHub Codespaces 中编辑并推送这些文件。

## 功能边界

- 岗位要求对照和招聘风险检查是有限词表匹配，只提供线索，不评估录用概率或判定招聘方是否合法。
- 本产品不抓取实时岗位、不自动投递、不提供账号同步，也不担保录用。
- 简历支持浏览器打印和另存为 PDF。为保护隐私，不接入第三方分析脚本。

## 技术

原生 HTML / CSS / JavaScript，无打包依赖。兼容现代桌面和移动浏览器。源码按需修改即可复用。

## 求职伙伴与联网 AI

「求职伙伴」默认提供本地引导：方向拆解、简历经历结构、面试练习和搜索清单。对话保存在本机浏览器。搜索清单打开 BOSS 直聘、智联招聘、中国公共招聘网、国家大学生就业服务平台的官网，由用户在原站搜索和核实岗位；本地模式不抓取实时职位、不声称已联网。

可选的联网 AI 后端放在 [`worker/`](worker/)：Cloudflare Worker 代为调用 OpenAI Responses API，在需要搜索岗位或最新信息时开启 `web_search`，并将网页引用链接交给前端展示。GitHub Pages 只托管前端，无法保管付费模型密钥。**部署 Worker、准备 OpenAI API 额度、设置私密访问令牌是独立步骤；ChatGPT 订阅不能自动为此接口付费。** 不部署 Worker，网站的本地功能仍可用。

部署时在自己的 Cloudflare 账户中创建 Worker，使用 `worker/index.js` 与 `worker/wrangler.jsonc`，将以下值设置为 Worker 环境 secret（切勿提交到 GitHub）：

- `OPENAI_API_KEY`：自己的 OpenAI API 密钥。
- `AGENT_ACCESS_TOKEN`：自行生成的高强度随机访问令牌，用来限制 API 费用暴露。

`APP_ORIGIN` 必须与正式网页的 origin 完全一致。`OPENAI_MODEL` 可更换为账户可用的模型。部署后在网页「求职伙伴 → 配置 AI 接口」填写 Worker 的 `https://.../api/chat` 地址与访问令牌。访问令牌只保留在当前页面内存，刷新后须重新填写；接口地址保存在当前浏览器。对话发送到该 Worker；「发送求职方向与简历文字」默认不勾选，即使勾选也会省略姓名、电话、邮箱和简历城市字段。Worker 不要求公开招聘平台账号，不代替用户登录、抓取或投递。请在 OpenAI 项目中设置使用额度，并根据实际访问量增设限流或独立用户身份验证；浏览器的跨域限制不等于服务端认证。
