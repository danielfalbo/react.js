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

/* ============= Incremental rendering ================ */

/* Return the logical next element of given 'fiberNode'.
 *
 * WLOG, the following is an example of fiber traveral order (A->Z).
 *
 *    A -> J -> K -> L -> Z
 *    |
 *    B -> I
 *    |
 *    C -> G -> H
 *    |
 *    D -> E
 *         |
 *         F
 *
 * We start at root A,
 * then explore A's child B,
 * then explore B's child C,
 * then explore C's child D,
 * then explore D's sibling E,
 * then explore E's sibling F,
 * then bubble up until we get to C's sibling G,
 * then explore G's sibling H,
 * then bubble up until we get to B's sibling I,
 * then bubble up until we get to A's sibling J,
 * then explore J's sibling K,
 * then explore K's sibling L,
 * then explore L's sibling Z,
 * finally end traversal as no sibling and no parent (root).
 * */
function getNext(fiberNode) {
  /* If has child, go to child. */
  if (fiberNode.child != null) {
    return fiberNode.child;
  }

  /* Traverse up the tree and return the first non-null sibling. */
  let nextFiberNode = fiberNode;
  while (nextFiberNode != null) {
    if (nextFiberNode.sibling != null) {
      return nextFiberNode.sibling;
    }
    nextFiberNode = nextFiberNode.parent;
  }

  /* Stop and return null when we finish exploring the root's last sibling. */
  return null;
}

/* ============= Cooperative concurrency ==============
 * https://developer.mozilla.org/docs/Web/API/Background_Tasks_API */

/* Non-blocking loop to perform as much work as fits in given 'deadline'
 * and request to perform the rest of work at next available idle period. */
function workLoop(deadline) {
  /* Execute virtual work until the given deadline is over. */
  let shouldYield = false;
  while (_nextWipFiberNode != null && !shouldYield) {
    _nextWipFiberNode = performUnitOfWork(_nextWipFiberNode);
    // https://developer.mozilla.org/docs/Web/API/IdleDeadline
    shouldYield = deadline.timeRemaining() < 1;
  }

  /* If finished all virtual work, apply changes to real DOM. */
  if (_nextWipFiberNode == null && _wipFiberRoot != null) {
    commit();
  }

  /* Request to perform more work at the next pass through the event loop.
   * https://developer.mozilla.org/docs/Web/API/Window/requestIdleCallback */
  requestIdleCallback(workLoop);
}

/* Set next unit of work to be the rendering of
 * the given React element onto the given Web API HTMLElement container.
 * https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement */
function render(reactElement, webApiHtmlElement) {
  _wipFiberRoot = {
    dom: webApiHtmlElement,
    props: { children: [reactElement] },
  };
  _nextWipFiberNode = _wipFiberRoot;
}

/* Performs a unit-of-work for the given 'fiberNode'
 * and returns the next unit-of-work's node.
 * Performing a unit of work means updating the given fiber
 * node and pushing it onto the parent's dom object. */
function performUnitOfWork(fiberNode) {
  if (isFunction(fiberNode.type)) {
    updateFunctionalComponent(fiberNode);
  } else {
    updateVanillaComponent(fiberNode);
  }

  return getNext(fiberNode);
}

/* ============== Virtual Rendering =================== */

/* Vanilla components are static components without hooks. */
function updateVanillaComponent(fiber) {
  if (fiber.dom == null) {
    fiber.dom = createDom(fiber);
  }

  const elements = fiber.props.children;
  reconcileChildren(fiber, elements);
}

function createDom(fiber) {
  const dom =
    fiber.type === "TEXT_ELEMENT"
      ? document.createTextNode("")
      : document.createElement(fiber.type);

  updateDom(dom, {}, fiber.props);

  return dom;
}

/* Functional components can implement hooks. */
function updateFunctionalComponent(fiber) {
  _wipFunctionalFiberNode = fiber;
  _hookIndex = 0;
  _wipFunctionalFiberNode.hooks = [];
  const children = [fiber.type(fiber.props)];
  reconcileChildren(fiber, children);
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
        _wipDeletions.push(oldFiber);
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

/* ==================== Hooks ========================= */

function useState(initial) {
  const alt = _wipFunctionalFiberNode.alternate;
  const oldHook =
    alt != null && alt.hooks != null ? alt.hooks[_hookIndex] : null;
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
    _wipFiberRoot = {
      dom: _flushedFiberRoot.dom,
      props: _flushedFiberRoot.props,
      alternate: _flushedFiberRoot,
    };
    _nextWipFiberNode = _wipFiberRoot;
    _wipDeletions = [];
  };

  _wipFunctionalFiberNode.hooks.push(hook);
  _hookIndex++;
  return [hook.state, setState];
}

function useEffect() {}

/* ====== Flushing virtual DOM onto browser's DOM ===== */

/* Commit the WIP root. */
function commit() {
  _wipDeletions.forEach(commitNode);
  commitNode(_wipFiberRoot.child);
  _flushedFiberRoot = _wipFiberRoot;
  _wipFiberRoot = null;
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

/* ================== React module ==================== */

const React = {
  createElement,
  render,
  useState,
  useEffect,
};

/* =============== React components =================== */

function Counter(props) {
  const [state, setState] = React.useState(props.initial);
  return React.createElement(
    /* type */
    "div",

    /* props */
    { style: "display: flex" },

    /* children */
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

function Hello({ name }) {
  return React.createElement("h1", null, "Hi, ", name);
}

const App = () =>
  React.createElement(
    /* type */
    "div",

    /* props */
    { id: "foo" },

    /* children */
    React.createElement(Hello, { name: "foo" }),
    React.createElement(
      "a",
      { href: "https://danielfalbo.com" },
      "danielfalbo.com",
    ),
    React.createElement("hr"),
    React.createElement(Counter, { initial: 42 }),
  );

/* =============== React globals ====================== */

/* Global pointer to the fiber root of the last rendered DOM */
let _flushedFiberRoot = null;

/* Global pointer to the fiber root of the work in progress buffer. */
let _wipFiberRoot = null;

/* Global pointer to the next unit of work as fiber node. */
let _nextWipFiberNode = null;

/* Array of fiber nodes that are present in the 'flushedFiberRoot'
 * but will get deleted at the next flush. */
let _wipDeletions = [];

/* */
let _wipFunctionalFiberNode = null;
/* */
let _hookIndex = null;

/* ====== Start React workLoop and render app ========= */

/* "Install" the workLoop inside the event loop. */
requestIdleCallback(workLoop);

/* Get HTML DOM node with id 'root'. */
const container = document.getElementById("root");

/* Create React object from functional component App. */
const element = React.createElement(App);

/* Mount the React object onto the DOM node. */
React.render(element, container);
