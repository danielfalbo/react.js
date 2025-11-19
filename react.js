/* ====================== Utils ======================= */

// https://developer.mozilla.org/docs/Web/JavaScript/Reference/Operators/typeof
function isObject(x) {
  return typeof x === "object";
}

// https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Function
function isFunction(f) {
  return f instanceof Function;
}

/* ============= Cooperative concurrency ==============
 * https://developer.mozilla.org/docs/Web/API/Background_Tasks_API */

const FIBER_NODE_DOM_KEY = "dom";
const FIBER_NODE_PARENT_KEY = "parent";
const FIBER_NODE_CHILD_KEY = "child";
const FIBER_NODE_SIBLING_KEY = "sibling";
const FIBER_NODE_ALTERNATE_KEY = "alternate";
const FIBER_EFFECT_TAG_KEY = "effectTag";

/* Effect tag for updated props. */
const EFFECT_TAG_UPDATE = "UPDATE";
/* Effect tag for added node. */
const EFFECT_TAG_PLACEMENT = "PLACEMENT";
/* Effect tag for deleted node. */
const EFFECT_TAG_DELETION = "DELETION";

function isFunctionalComponent(fiber) {
  return isFunction(fiber[REACT_ELEMENT_TYPE_KEY]);
}

/* Performs a unit-of-work for the given 'fiber' node
 * and returns the next unit-of-work's node.
 * Performing a unit of work means
 * creating a dom object for the given fiber node
 * and pushing it onto the parent dom object. */
function performUnitOfWork(fiber) {
  if (fiber[FIBER_NODE_DOM_KEY] == null) {
    fiber[FIBER_NODE_DOM_KEY] = createDom(fiber);
  }

  const elements = fiber[REACT_ELEMENT_PROPS_KEY][REACT_CHILDREN_PROP_KEY];
  reconcileChildren(fiber, elements);

  if (fiber[FIBER_NODE_CHILD_KEY] != null) {
    return fiber[FIBER_NODE_CHILD_KEY];
  }

  let nextFiber = fiber;
  while (nextFiber != null) {
    if (nextFiber[FIBER_NODE_SIBLING_KEY] != null) {
      return nextFiber[FIBER_NODE_SIBLING_KEY];
    }
    nextFiber = nextFiber[FIBER_NODE_PARENT_KEY];
  }
}

function reconcileChildren(fiber, elements) {
  let prevSibling = null;
  let alt = fiber[FIBER_NODE_ALTERNATE_KEY];
  let oldFiber = alt == null ? null : alt[FIBER_NODE_CHILD_KEY];
  let i = 0;
  while (i < elements.length || oldFiber != null) {
    const element = elements[i];
    let newFiber = null;

    const sameType =
      oldFiber != null &&
      element != null &&
      element[REACT_ELEMENT_TYPE_KEY] == oldFiber[REACT_ELEMENT_TYPE_KEY];

    if (sameType) {
      /* Same type, so just update props. */
      newFiber = {
        [REACT_ELEMENT_TYPE_KEY]: element[REACT_ELEMENT_TYPE_KEY],
        [REACT_ELEMENT_PROPS_KEY]: element[REACT_ELEMENT_PROPS_KEY],
        [FIBER_NODE_DOM_KEY]: oldFiber[FIBER_NODE_DOM_KEY],
        [FIBER_NODE_PARENT_KEY]: fiber,
        [FIBER_NODE_ALTERNATE_KEY]: oldFiber,
        [FIBER_EFFECT_TAG_KEY]: EFFECT_TAG_UPDATE,
      };
    } else {
      /* New element. */
      if (element != null) {
        newFiber = {
          [REACT_ELEMENT_TYPE_KEY]: element[REACT_ELEMENT_TYPE_KEY],
          [REACT_ELEMENT_PROPS_KEY]: element[REACT_ELEMENT_PROPS_KEY],
          [FIBER_NODE_DOM_KEY]: null,
          [FIBER_NODE_PARENT_KEY]: fiber,
          [FIBER_NODE_ALTERNATE_KEY]: null,
          [FIBER_EFFECT_TAG_KEY]: EFFECT_TAG_PLACEMENT,
        };
      }

      /* Deleted element. */
      if (oldFiber != null) {
        oldFiber[FIBER_EFFECT_TAG_KEY] = EFFECT_TAG_DELETION;
        wipDeletions.push(oldFiber);
      }
    }

    if (i === 0) {
      fiber[FIBER_NODE_CHILD_KEY] = newFiber;
    } else {
      prevSibling[FIBER_NODE_SIBLING_KEY] = newFiber;
    }

    prevSibling = newFiber;

    i++;
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

/* Returns True iff the given prop 'key' is an event listener. */
function isEvent(key) {
  return key.startsWith("on");
}

/* Returns the lowercased event type represented by the given 'key'. */
function getEventType(key) {
  // Event listener keys start with "on", so we strip it out.
  return key.toLowerCase().substring(2);
}

/* Returns True if the given 'key' is a property key,
 * False if it is the REACT_CHILDREN_PROP_KEY or an event listener. */
function isProperty(key) {
  return key !== REACT_CHILDREN_PROP_KEY && !isEvent(key);
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
        isObject(child) ? child : createTextElement(child),
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

function isNew(prev, next) {
  function isKeyNew(key) {
    return prev[key] !== next[key];
  }
  return isKeyNew;
}
function isGone(next) {
  function isKeyGone(key) {
    return !(key in next);
  }
  return isKeyGone;
}
function updateDom(dom, prevProps, nextProps) {
  /* Remove old or changed event listeners. */
  Object.keys(prevProps)
    .filter(isEvent)
    .filter((key) => isGone(nextProps)(key) || isNew(prevProps, nextProps))
    .forEach((key) => {
      const eventType = getEventType(key);
      dom.removeEventListener(eventType, prevProps[key]);
    });

  /* Remove old properties. */
  Object.keys(prevProps)
    .filter(isProperty)
    .filter(isGone(nextProps))
    .forEach((key) => {
      delete dom[key];
    });

  /* Set new or changed properties. */
  Object.keys(nextProps)
    .filter(isProperty)
    .filter(isNew(prevProps, nextProps))
    .forEach((key) => {
      dom[key] = nextProps[key];
    });

  /* Add new or changed event listeners. */
  Object.keys(nextProps)
    .filter(isEvent)
    .filter(isNew(prevProps, nextProps))
    .forEach((key) => {
      const eventType = getEventType(key);
      dom.addEventListener(eventType, nextProps[key]);
    });
}

/* Commit the WIP root. */
function commit() {
  wipDeletions.forEach(commitNode);
  commitNode(wipRoot[FIBER_NODE_CHILD_KEY]);
  currentRoot = wipRoot;
  wipRoot = null;
}

/* Commit the given fiber node,
 * rendering the given node's dom onto the parent's dom. */
function commitNode(fiber) {
  if (fiber == null) {
    return;
  }
  const domParent = fiber[FIBER_NODE_PARENT_KEY][FIBER_NODE_DOM_KEY];

  if (fiber[FIBER_EFFECT_TAG_KEY] === EFFECT_TAG_PLACEMENT) {
    domParent.appendChild(fiber[FIBER_NODE_DOM_KEY]);
  } else if (fiber[FIBER_EFFECT_TAG_KEY] === EFFECT_TAG_DELETION) {
    domParent.removeChild(fiber[FIBER_NODE_DOM_KEY]);
  } else if (
    fiber[FIBER_EFFECT_TAG_KEY] === EFFECT_TAG_UPDATE &&
    fiber[FIBER_NODE_DOM_KEY] != null
  ) {
    updateDom(
      fiber[FIBER_NODE_DOM_KEY],
      fiber[FIBER_NODE_ALTERNATE_KEY][REACT_ELEMENT_PROPS_KEY],
      fiber[REACT_ELEMENT_PROPS_KEY],
    );
  } else {
    console.error("Illegal effect tag", fiber[FIBER_EFFECT_TAG_KEY]);
  }

  commitNode(fiber[FIBER_NODE_CHILD_KEY]);
  commitNode(fiber[FIBER_NODE_SIBLING_KEY]);
}

/* Set next unit of work to be the rendering of the given
 * 'element' onto the given 'container'. */
function render(element, container) {
  nextUnitOfWork = wipRoot = {
    [FIBER_NODE_DOM_KEY]: container,
    [REACT_ELEMENT_PROPS_KEY]: { [REACT_CHILDREN_PROP_KEY]: [element] },
    [FIBER_NODE_ALTERNATE_KEY]: currentRoot,
  };
}

/* ================== React module ==================== */

const React = {
  createElement,
  render,
};

/* ================== React app ======================= */

/* Global pointer to the fiber root of the DOM currently rendered. */
let currentRoot = null;

/* Work in progress root as fiber node.
 * To perform work in units but only mutate DOM
 * when work is entirely done. */
let wipRoot = null;
/* Work in progress elements to delete. */
let wipDeletions = [];
/* Global pointer to the next unit of work as fiber node. */
let nextUnitOfWork = null;

/* "Install" the work loop inside the event loop. */
requestIdleCallback(workLoop);

function Hello(props) {
  return React.createElement("h1", null, "Hi, ", props.name);
}

const element = React.createElement(
  "div",
  { id: "foo" },
  React.createElement(Hello, { name: "foo" }),
  React.createElement("a", { href: "https://danielfalbo.com" }, "bar"),
  React.createElement("hr"),
);

const container = document.getElementById("root");
React.render(element, container);
