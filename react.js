/* ================= Utils ============================ */

// https://developer.mozilla.org/docs/Web/JavaScript/Reference/Operators/typeof
function isJsObject(x) {
  return typeof x === "object";
}

/* ============= Cooperative concurrency ==============
 * https://developer.mozilla.org/docs/Web/API/Background_Tasks_API */

/* Global pointer to the next unit of work. */
let nextUnitOfWork = null;

/* Performs the given 'nextUnitOfWork' and returns
 * the next unit of work. */
function performUnitOfWork(nextUnitOfWork) {}

/* Execute work until the given deadline is over,
 * then recursively enqueue itself to perform more work
 * at the next pass through the event loop. */
function workLoop(deadline) {
  let shouldYield = false;
  while (nextUnitOfWork != null && !shouldYield) {
    nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
    // https://developer.mozilla.org/docs/Web/API/IdleDeadline
    shouldYield = deadline.timeRemaining() < 1;
  }
  // https://developer.mozilla.org/docs/Web/API/Window/requestIdleCallback
  requestIdleCallback(workLoop);
}

/* "Install" the work loop inside the event loop. */
requestIdleCallback(workLoop);

/* ============== React element object ================ */

/* Key of children within React props object. */
const REACT_CHILDREN_PROP_KEY = "children";

/* Returns True if the given 'key' is a property key,
 * False if it is the REACT_CHILDREN_PROP_KEY. */
function isProperty(key) {
  return key !== REACT_CHILDREN_PROP_KEY;
}

/* Key of props within React element object. */
const REACT_ELEMENT_PROPS_KEY = "props";

/* Key of type within React element object. */
const REACT_ELEMENT_TYPE_KEY = "type";

// https://developer.mozilla.org/docs/Web/API/Node/nodeValue
const TEXT_ELEMENT_VALUE_PROP_KEY = "nodeValue";

const REACT_TEXT_ELEMENT_TYPE_NAME = "TEXT_ELEMENT";
/* Create React text element object.
 * Text elements look like
 * {
 *    type: "TEXT_ELEMENT",
 *    props: { nodeValue: "text here", children: [] }
 * }
 */
function createTextElement(text) {
  return createElement(REACT_TEXT_ELEMENT_TYPE_NAME, {
    [TEXT_ELEMENT_VALUE_PROP_KEY]: text,
  });
}

/* Create React element object.
 *
 * For example
 *
 * createElement(
 *   "div",
 *   { id: "foo" },
 *   React.createElement("h1", { title: "foo" }, "Hello"),
 *   React.createElement("a", { href: "https://danielfalbo.com" }, "bar"),
 *   React.createElement("b")
 * )
 *
 * returns an object like
 *
 * {
 *    type: "div",
 *    props: {
 *      id: "foo",
 *      children: [
 *        {
 *          type: "h1",
 *          props: {
 *            title: "foo",
 *            children: [
 *              { type: "TEXT_ELEMENT", props: { nodeValue: "Hello" } }
 *            ]
 *          }
 *        },
 *
 *        {
 *          type: "a",
 *          props: {
 *            href: "https://danielfalbo.com",
 *            children: [
 *              { type: "TEXT_ELEMENT", props: { nodeValue: "bar" } }
 *            ]
 *          }
 *        },
 *
 *        { type: "b" },
 *      ]
 *    }
 * }
 *
 * which represents
 *
 * <div id="foo">
 *   <h1 title="foo">
 *     Hello
 *   </h1>
 *
 *   <a href="https://danielfalbo.com">
 *     bar
 *   </a>
 *
 *   <b />
 * </div>
 */
function createElement(type, props, ...children) {
  return {
    [REACT_ELEMENT_TYPE_KEY]: type,

    [REACT_ELEMENT_PROPS_KEY]: {
      ...props,

      /* Children are just the value of the REACT_CHILDREN_PROP_KEY prop. */
      [REACT_CHILDREN_PROP_KEY]: children.map((child) =>
        isJsObject(child) ? child : createTextElement(child),
      ),
    },
  };
}

/* ======== Rendering react element onto DOM ========== */

function render(element, container) {
  const dom =
    element[REACT_ELEMENT_TYPE_KEY] === REACT_TEXT_ELEMENT_TYPE_NAME
      ? document.createTextNode("")
      : document.createElement(element[REACT_ELEMENT_TYPE_KEY]);

  Object.keys(element[REACT_ELEMENT_PROPS_KEY])
    .filter(isProperty)
    .forEach((key) => {
      dom[key] = element[REACT_ELEMENT_PROPS_KEY][key];
    });

  element.props[REACT_CHILDREN_PROP_KEY].forEach((child) => {
    render(child, dom);
  });

  container.appendChild(dom);
}

/* ================== React module ==================== */

const React = {
  createElement,
  render,
};

/* ================== React app ======================= */

/* Create and render a React app onto the "root" element. */

const container = document.getElementById("root");

const element = React.createElement(
  "div",
  { id: "foo" },
  React.createElement("h1", { title: "foo" }, "Hello"),
  React.createElement("a", { href: "https://danielfalbo.com" }, "bar"),
  React.createElement("hr"),
);

React.render(element, container);
