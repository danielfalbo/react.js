/* ====================== Utils ======================= */

// https://developer.mozilla.org/docs/Web/JavaScript/Reference/Operators/typeof
function isObject(x) {
  return typeof x === "object";
}

// https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Function
function isFunction(f) {
  return f instanceof Function;
}

/* ============= Data structures ====================== */

const DOM_KEY = "dom";
const PARENT_KEY = "parent";
const CHILD_KEY = "child";
const SIBLING_KEY = "sibling";
const ALTERNATE_KEY = "alternate";
const EFFECT_TAG_KEY = "effectTag";
const HOOKS_KEY = "hooks";

const STATE_KEY = "state";
const QUEUE_KEY = "queue";

/* Effect tag for updated props. */
const TAG_UPDATE = "UPDATE";
/* Effect tag for added node. */
const TAG_PLACEMENT = "PLACEMENT";
/* Effect tag for deleted node. */
const TAG_DELETION = "DELETION";

/* Key of children within React props object. */
const CHILDREN_KEY = "children";

/* Key of props within React element object. */
const PROPS_KEY = "props";

/* Key of type within React element object. */
const TYPE_KEY = "type";

// https://developer.mozilla.org/docs/Web/API/Node/nodeValue
const NODE_VALUE_KEY = "nodeValue";

/* Type name for React element objects that translate to DOM text nodes. */
const TYPE_TEXT_ELEMENT = "TEXT_ELEMENT";

/* ============= Cooperative concurrency ==============
 * https://developer.mozilla.org/docs/Web/API/Background_Tasks_API */

/* Performs a unit-of-work for the given 'fiber' node
 * and returns the next unit-of-work's node.
 * Performing a unit of work means
 * creating a dom object for the given fiber node
 * and pushing it onto the parent dom object. */
function performUnitOfWork(fiber) {
  if (isFunctionalComponent(fiber)) {
    updateFunctionalComponent(fiber);
  } else {
    updateComponent(fiber);
  }

  if (fiber[CHILD_KEY] != null) {
    return fiber[CHILD_KEY];
  }

  let nextFiber = fiber;
  while (nextFiber != null) {
    if (nextFiber[SIBLING_KEY] != null) {
      return nextFiber[SIBLING_KEY];
    }
    nextFiber = nextFiber[PARENT_KEY];
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

function isFunctionalComponent(fiber) {
  return isFunction(fiber[TYPE_KEY]);
}

function useState(initial) {
  const alt = wipFiber[ALTERNATE_KEY];
  const oldHook =
    alt != null && alt[HOOKS_KEY] != null ? alt[HOOKS_KEY][hookIndex] : null;
  const hook = {
    [STATE_KEY]: oldHook != null ? oldHook[STATE_KEY] : initial,
    [QUEUE_KEY]: [],
  };

  const actions = oldHook ? oldHook[QUEUE_KEY] : [];
  actions.forEach((action) => {
    hook[STATE_KEY] = action(hook[STATE_KEY]);
  });

  const setState = (action) => {
    hook[QUEUE_KEY].push(action);
    wipRoot = {
      [DOM_KEY]: currentRoot[DOM_KEY],
      [PROPS_KEY]: currentRoot[PROPS_KEY],
      [ALTERNATE_KEY]: currentRoot,
    };
    nextUnitOfWork = wipRoot;
    wipDeletions = [];
  };

  wipFiber[HOOKS_KEY].push(hook);
  hookIndex++;
  return [hook.state, setState];
}

function updateFunctionalComponent(fiber) {
  wipFiber = fiber;
  hookIndex = 0;
  wipFiber[HOOKS_KEY] = [];
  const children = [fiber[TYPE_KEY](fiber[PROPS_KEY])];
  reconcileChildren(fiber, children);
}

function updateComponent(fiber) {
  if (fiber[DOM_KEY] == null) {
    fiber[DOM_KEY] = createDom(fiber);
  }

  const elements = fiber[PROPS_KEY][CHILDREN_KEY];
  reconcileChildren(fiber, elements);
}

function reconcileChildren(fiber, elements) {
  let prevSibling = null;
  let alt = fiber[ALTERNATE_KEY];
  let oldFiber = alt == null ? null : alt[CHILD_KEY];
  let i = 0;
  while (i < elements.length || oldFiber != null) {
    const element = elements[i];
    let newFiber = null;

    const sameType =
      oldFiber != null &&
      element != null &&
      element[TYPE_KEY] === oldFiber[TYPE_KEY];

    if (sameType) {
      /* Same type, so just update props. */
      newFiber = {
        [TYPE_KEY]: element[TYPE_KEY],
        [PROPS_KEY]: element[PROPS_KEY],
        [DOM_KEY]: oldFiber[DOM_KEY],
        [PARENT_KEY]: fiber,
        [ALTERNATE_KEY]: oldFiber,
        [EFFECT_TAG_KEY]: TAG_UPDATE,
      };
    } else {
      /* New element. */
      if (element != null) {
        newFiber = {
          [TYPE_KEY]: element[TYPE_KEY],
          [PROPS_KEY]: element[PROPS_KEY],
          [DOM_KEY]: null,
          [PARENT_KEY]: fiber,
          [ALTERNATE_KEY]: null,
          [EFFECT_TAG_KEY]: TAG_PLACEMENT,
        };
      }

      /* Deleted element. */
      if (oldFiber != null) {
        oldFiber[EFFECT_TAG_KEY] = TAG_DELETION;
        wipDeletions.push(oldFiber);
      }
    }

    if (oldFiber != null) {
      oldFiber = oldFiber[SIBLING_KEY];
    }

    if (i === 0) {
      fiber[CHILD_KEY] = newFiber;
    } else {
      prevSibling[SIBLING_KEY] = newFiber;
    }

    prevSibling = newFiber;

    i++;
  }
}

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
 * False if it is the CHILDREN_KEY or an event listener. */
function isProperty(key) {
  return key !== CHILDREN_KEY && !isEvent(key);
}

/* Create React text element object.
 * Text elements look like
 * {
 *    type: "TEXT_ELEMENT",
 *    props: { nodeValue: "text here", children: [] }
 * }
 */
function createTextElement(text) {
  return createElement(TYPE_TEXT_ELEMENT, {
    [NODE_VALUE_KEY]: text,
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
 * </div> */
function createElement(type, props, ...children) {
  return {
    [TYPE_KEY]: type,

    [PROPS_KEY]: {
      ...props,

      /* Children are just the value of the CHILDREN_KEY prop. */
      [CHILDREN_KEY]: children.map((child) =>
        isObject(child) ? child : createTextElement(child),
      ),
    },
  };
}

/* ==================== Rendering ===================== */

function createDom(fiber) {
  const dom =
    fiber[TYPE_KEY] === TYPE_TEXT_ELEMENT
      ? document.createTextNode("")
      : document.createElement(fiber[TYPE_KEY]);

  updateDom(dom, {}, fiber[PROPS_KEY]);

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
    .filter((key) => isGone(nextProps)(key) || isNew(prevProps, nextProps)(key))
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
  commitNode(wipRoot[CHILD_KEY]);
  currentRoot = wipRoot;
  wipRoot = null;
}

/* Commit the given fiber node,
 * rendering the given node's dom onto the parent's dom. */
function commitNode(fiber) {
  if (fiber == null) {
    return;
  }

  let domParentFiber = fiber[PARENT_KEY];
  while (domParentFiber[DOM_KEY] == null) {
    domParentFiber = domParentFiber[PARENT_KEY];
  }
  const domParent = domParentFiber[DOM_KEY];

  if (fiber[EFFECT_TAG_KEY] === TAG_PLACEMENT && fiber[DOM_KEY] != null) {
    domParent.appendChild(fiber[DOM_KEY]);
  } else if (fiber[EFFECT_TAG_KEY] === TAG_UPDATE && fiber[DOM_KEY] != null) {
    updateDom(
      fiber[DOM_KEY],
      fiber[ALTERNATE_KEY][PROPS_KEY],
      fiber[PROPS_KEY],
    );
  } else if (fiber[EFFECT_TAG_KEY] === TAG_DELETION) {
    commitDeletion(fiber, domParent);
  }

  commitNode(fiber[CHILD_KEY]);
  commitNode(fiber[SIBLING_KEY]);
}

function commitDeletion(fiber, domParent) {
  if (fiber[DOM_KEY] != null) {
    domParent.removeChild(fiber[DOM_KEY]);
  } else {
    commitDeletion(fiber[CHILD_KEY], domParent);
  }
}

/* Set next unit of work to be the rendering of the given
 * 'element' onto the given 'container'. */
function render(element, container) {
  nextUnitOfWork = wipRoot = {
    [DOM_KEY]: container,
    [PROPS_KEY]: { [CHILDREN_KEY]: [element] },
    [ALTERNATE_KEY]: currentRoot,
  };
}

/* ================== React module ==================== */

const React = {
  createElement,
  render,
  useState,
};

/* ================== React app ======================= */

/* Global pointer to the fiber root of the DOM currently rendered. */
let currentRoot = null;

/* Global pointer to the next unit of work as fiber node. */
let nextUnitOfWork = null;

/* Work in progress root as fiber node.
 * To perform work in units but only mutate DOM
 * when work is entirely done. */
let wipRoot = null;

/* Work in progress elements to delete. */
let wipDeletions = [];

/* */
let wipFiber = null;
/* */
let hookIndex = null;

/* "Install" the work loop inside the event loop. */
requestIdleCallback(workLoop);

function Hello(props) {
  return React.createElement("h1", null, "Hi, ", props.name);
}

function Counter() {
  const [state, setState] = React.useState(1);
  return React.createElement(
    "h1",
    { onClick: () => setState((c) => c + 1) },
    `Count: ${state}`,
  );
}

const element = React.createElement(
  "div",
  { id: "foo" },
  React.createElement(Hello, { name: "foo" }),
  React.createElement("a", { href: "https://danielfalbo.com" }, "bar"),
  React.createElement("hr"),
  React.createElement(Counter),
);

const container = document.getElementById("root");
React.render(element, container);
