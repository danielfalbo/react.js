/* ====================== Utils ======================= */

// https://developer.mozilla.org/docs/Web/JavaScript/Reference/Operators/typeof
function isJsObject(x) {
  return typeof x === "object";
}

/* ============= Cooperative concurrency ==============
 * https://developer.mozilla.org/docs/Web/API/Background_Tasks_API */

FIBER_NODE_DOM_KEY = "dom";
FIBER_NODE_PARENT_KEY = "parent";
FIBER_NODE_CHILD_KEY = "child";
FIBER_NODE_SIBLING_KEY = "sibling";

/* Performs the given 'unitOfWork' and returns the next.
 * Units of work are fiber nodes. Performing a unit of work
 * means creating a dom object for the given fiber node
 * and pushing it onto the parent dom object. */
function performUnitOfWork(unitOfWork) {
  if (unitOfWork[FIBER_NODE_DOM_KEY] == null) {
    unitOfWork[FIBER_NODE_DOM_KEY] = createDom(unitOfWork);
  }

  if (unitOfWork[FIBER_NODE_PARENT_KEY] != null) {
    unitOfWork[FIBER_NODE_PARENT_KEY][FIBER_NODE_DOM_KEY].appendChild(
      unitOfWork[FIBER_NODE_DOM_KEY],
    );
  }

  const elements = unitOfWork[REACT_ELEMENT_PROPS_KEY][REACT_CHILDREN_PROP_KEY];
  let prevSibling = null;
  for (let i = 0; i < elements.length; i++) {
    const element = elements[i];

    const newFiber = {
      [REACT_ELEMENT_TYPE_KEY]: element[REACT_ELEMENT_TYPE_KEY],
      [REACT_ELEMENT_PROPS_KEY]: element[REACT_ELEMENT_PROPS_KEY],
      [FIBER_NODE_PARENT_KEY]: unitOfWork,
      [FIBER_NODE_DOM_KEY]: null,
    };

    if (i === 0) {
      unitOfWork[FIBER_NODE_CHILD_KEY] = newFiber;
    } else {
      prevSibling[FIBER_NODE_SIBLING_KEY] = newFiber;
    }

    prevSibling = newFiber;
  }

  if (unitOfWork[FIBER_NODE_CHILD_KEY] != null) {
    return unitOfWork[FIBER_NODE_CHILD_KEY];
  }

  let nextFiber = unitOfWork;
  while (nextFiber != null) {
    if (nextFiber[FIBER_NODE_SIBLING_KEY] != null) {
      return nextFiber[FIBER_NODE_SIBLING_KEY];
    }
    nextFiber = nextFiber[FIBER_NODE_PARENT_KEY];
  }
}

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

  if (nextUnitOfWork == null && wipRoot != null) {
    commit();
  }

  // https://developer.mozilla.org/docs/Web/API/Window/requestIdleCallback
  requestIdleCallback(workLoop);
}

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

/* ==================== Rendering ===================== */

function createDom(fiber) {
  const dom =
    fiber[REACT_ELEMENT_TYPE_KEY] === REACT_TEXT_ELEMENT_TYPE_NAME
      ? document.createTextNode("")
      : document.createElement(fiber[REACT_ELEMENT_TYPE_KEY]);

  Object.keys(fiber[REACT_ELEMENT_PROPS_KEY])
    .filter(isProperty)
    .forEach((key) => {
      dom[key] = fiber[REACT_ELEMENT_PROPS_KEY][key];
    });

  return dom;
}

/* Commit the WIP root. */
function commit() {
  commitNode(wipRoot[FIBER_NODE_CHILD_KEY]);
  wipRoot = null;
}

/* Commit the given fiber node,
 * rendering the given node's dom onto the parent's dom. */
function commitNode(fiber) {
  if (fiber == null) {
    return;
  }
  const domParent = fiber[FIBER_NODE_PARENT_KEY][FIBER_NODE_DOM_KEY];
  domParent.appendChild(fiber[FIBER_NODE_DOM_KEY]);
  commitNode(fiber[FIBER_NODE_CHILD_KEY]);
  commitNode(fiber[FIBER_NODE_SIBLING_KEY]);
}

/* Set next unit of work to be the rendering of the given
 * 'element' onto the given 'container'. */
function render(element, container) {
  nextUnitOfWork = wipRoot = {
    [FIBER_NODE_DOM_KEY]: container,
    [REACT_ELEMENT_PROPS_KEY]: { [REACT_CHILDREN_PROP_KEY]: [element] },
  };
}

/* ================== React module ==================== */

const React = {
  createElement,
  render,
};

/* ================== React app ======================= */

/* Work in progress root as fiber node.
 * To perform work in units but only mutate DOM
 * when work is entirely done. */
let wipRoot = null;
/* Global pointer to the next unit of work as fiber node. */
let nextUnitOfWork = null;

/* "Install" the work loop inside the event loop. */
requestIdleCallback(workLoop);

const container = document.getElementById("root");

const element = React.createElement(
  "div",
  { id: "foo" },
  React.createElement("h1", { title: "foo" }, "Hello"),
  React.createElement("a", { href: "https://danielfalbo.com" }, "bar"),
  React.createElement("hr"),
);

React.render(element, container);
