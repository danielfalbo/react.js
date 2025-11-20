/* ====================== Utils ======================= */

// https://developer.mozilla.org/docs/Web/JavaScript/Reference/Operators/typeof
function isObject(x) {
  return typeof x === "object";
}

// https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Function
function isFunction(f) {
  return f instanceof Function;
}

/* ============== React element object ================ */

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
    type,

    props: {
      ...props,

      /* Children are just the value of the CHILDREN_KEY prop. */
      children: children.map((child) =>
        isObject(child) ? child : createTextElement(child),
      ),
    },
  };
}

/* Create React text element object.
 * Text elements are structured like
 * {
 *    type: "TEXT_ELEMENT",
 *    props: { nodeValue: "text here" }
 * }
 */
function createTextElement(text) {
  return createElement("TEXT_ELEMENT", {
    // https://developer.mozilla.org/docs/Web/API/Node/nodeValue
    nodeValue: text,
  });
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
  return key !== "children" && !isEvent(key);
}

/* ============= Cooperative concurrency ==============
 * https://developer.mozilla.org/docs/Web/API/Background_Tasks_API */

/* Performs a unit-of-work for the given 'fiberNode'
 * and returns the next unit-of-work's node.
 * Performing a unit of work means updating the given fiber
 * node and pushing it onto the parent's dom object. */
function performUnitOfWork(fiberNode) {
  if (isFunction(fiberNode.type)) {
    updateFunctionalComponent(fiberNode);
  } else {
    updateComponent(fiberNode);
  }

  /* Fiber traversal:
   * if has child: go to child;
   * else if has sibling: go to sibling;
   * else return parent's sibling,
   *    backtracking to parents until one has a sibling, or returning
   *    null if we backtrack until the root and there's nothing to do.
   * */
  if (fiberNode.child != null) {
    return fiberNode.child;
  }
  let nextFiberNode = fiberNode;
  while (nextFiberNode != null) {
    if (nextFiberNode.sibling != null) {
      return nextFiberNode.sibling;
    }
    nextFiberNode = nextFiberNode.parent;
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

/* ==================== Hooks ========================= */

function useState(initial) {
  const alt = wipFiber.alternate;
  const oldHook =
    alt != null && alt.hooks != null ? alt.hooks[hookIndex] : null;
  const hook = {
    state: oldHook != null ? oldHook.state : initial,
    queue: [],
  };

  const actions = oldHook ? oldHook.queue : [];
  actions.forEach((action) => {
    hook.state = action(hook.state);
  });

  const setState = (action) => {
    hook.queue.push(action);
    wipRoot = {
      dom: currentRoot.dom,
      props: currentRoot.props,
      alternate: currentRoot,
    };
    nextUnitOfWork = wipRoot;
    wipDeletions = [];
  };

  wipFiber.hooks.push(hook);
  hookIndex++;
  return [hook.state, setState];
}

/* ==================== Rendering ===================== */

function createDom(fiber) {
  const dom =
    fiber.type === "TEXT_ELEMENT"
      ? document.createTextNode("")
      : document.createElement(fiber.type);

  updateDom(dom, {}, fiber.props);

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

function updateFunctionalComponent(fiber) {
  wipFiber = fiber;
  hookIndex = 0;
  wipFiber.hooks = [];
  const children = [fiber.type(fiber.props)];
  reconcileChildren(fiber, children);
}

function updateComponent(fiber) {
  if (fiber.dom == null) {
    fiber.dom = createDom(fiber);
  }

  const elements = fiber.props.children;
  reconcileChildren(fiber, elements);
}

function reconcileChildren(fiber, elements) {
  let prevSibling = null;
  let alt = fiber.alternate;
  let oldFiber = alt == null ? null : alt.child;
  let i = 0;
  while (i < elements.length || oldFiber != null) {
    const element = elements[i];
    let newFiber = null;

    const sameType =
      oldFiber != null && element != null && element.type === oldFiber.type;

    if (sameType) {
      /* Same type, so just update props. */
      newFiber = {
        type: element.type,
        props: element.props,
        dom: oldFiber.dom,
        parent: fiber,
        alternate: oldFiber,
        effectTag: "UPDATE",
      };
    } else {
      /* New element. */
      if (element != null) {
        newFiber = {
          type: element.type,
          props: element.props,
          dom: null,
          parent: fiber,
          alternate: null,
          effectTag: "PLACEMENT",
        };
      }

      /* Deleted element. */
      if (oldFiber != null) {
        oldFiber.effectTag = "DELETION";
        wipDeletions.push(oldFiber);
      }
    }

    if (oldFiber != null) {
      oldFiber = oldFiber.sibling;
    }

    if (i === 0) {
      fiber.child = newFiber;
    } else {
      prevSibling.sibling = newFiber;
    }

    prevSibling = newFiber;

    i++;
  }
}

/* Commit the WIP root. */
function commit() {
  wipDeletions.forEach(commitNode);
  commitNode(wipRoot.child);
  currentRoot = wipRoot;
  wipRoot = null;
}

/* Commit the given fiber node,
 * rendering the given node's dom onto the parent's dom. */
function commitNode(fiber) {
  if (fiber == null) {
    return;
  }

  let domParentFiber = fiber.parent;
  while (domParentFiber.dom == null) {
    domParentFiber = domParentFiber.parent;
  }
  const domParent = domParentFiber.dom;

  if (fiber.effectTag === "PLACEMENT" && fiber.dom != null) {
    domParent.appendChild(fiber.dom);
  } else if (fiber.effectTag === "UPDATE" && fiber.dom != null) {
    updateDom(fiber.dom, fiber.alternate.props, fiber.props);
  } else if (fiber.effectTag === "DELETION") {
    commitDeletion(fiber, domParent);
  }

  commitNode(fiber.child);
  commitNode(fiber.sibling);
}

function commitDeletion(fiber, domParent) {
  if (fiber.dom != null) {
    domParent.removeChild(fiber.dom);
  } else {
    commitDeletion(fiber.child, domParent);
  }
}

/* Set next unit of work to be the rendering of the given
 * 'element' onto the given 'container'. */
function render(element, container) {
  nextUnitOfWork = wipRoot = {
    dom: container,
    props: { children: [element] },
    alternate: currentRoot,
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
    "div",
    { style: "display: flex" },
    React.createElement(
      "button",
      { onClick: () => setState((c) => c - 1) },
      `-1`,
    ),
    React.createElement("h1", { style: "margin: 10px" }, `Count: ${state}`),
    React.createElement(
      "button",
      { onClick: () => setState((c) => c + 1) },
      `+1`,
    ),
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
