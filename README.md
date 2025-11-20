# React

Toy React implementation

## Skeptical AI prompt for learning

Usually prompted to the best thinking LLM available at the given time.


```
<Sample Flow explanation>
</Sample Flow explanation>

<react.js>
</react.js>

I'm a professor at a top university.
I'm teaching a front-end internals and data structures course.
One of my students just built a Toy React
implementation following Rodrigo Pombo's `didact`.
This is their progress so far.

What do you see from their current implementation?
What are they doing wrong?
Do you see red flags?
Do you think they understand what they are doing?
Do you see any correctness issue?
Do you see any bug?
```

## Sample Flow

1. The `workLoop` is "installed" within the browser's event loop.
2. `React.render(element, container)` sets as next unit of work
to rendering of `element` as child of `container`.
3. One fiber node at a time, the `workLoop` incrementally renders
the elements as DOM-like objects at the `_wipFiberRoot` buffer.
4. As we finish rendering the last fiber node, `workLoop` calls `commit`
which flushes the changes accumulated at `_wipFiberRoot` onto the browser's DOM.
All nodes will have the `"UPDATE"` `effectTag` and
`isNew(prevProps, nextProps)(key)` will return `True` for every prop of every
node, so all the changes will be applied to the `htmlElement`.
5. You click on the `+1` button.
6. The callback associated with the button is enqueued
onto the browser's Tasks Queue.
7. Eventually the Event Loop executes the enqueued callback, which
- enqueues the action `(oldState) => oldState + 1` onto the hook's actions queue
within the `_wipFunctionalFiberNode` hooks actions cache,
- sets `_wipFiberRoot` and `_nextWipFiberNode` to the `_flushedFiberRoot`, which
will in practice be a virtual representation of what's already rendered.
8. At the following `workLoop` call, it finds non-null `_nextWipFiberNode`, so
proceeds with the work needed to render the given fiber tree onto the
`_wipFiberRoot` buffer.
9. Most nodes's props are copied as they are. Except: when it gets to the node
representing the component containing the hook whose action has been taken, all
actions found in the hook's queue are executed onto the previous
`_wipFunctionalFiberNode` state, the result is used as new value for the hook's
state value.
10. As we finish rendering the last fiber node, `workLoop` calls `commit`
which flushes the changes accumulated at `_wipFiberRoot` onto the browser's DOM.
The `isNew(prevProps, nextProps)(key)` check for the `"UPDATE"`d nodes diff and
will filter out most nodes, except our `Counter` node, which will have a new
value for the counter, which will then be applied to its `htmlElement`.
11. You see the counter value increased by 1 in your browser.

## Resources

1. [Rodrigo Pombo's `didact`](https://pomb.us/build-your-own-react/)

- ["Event Loop, Web APIs, (Micro)task Queue" by Lydia Hallie](https://youtu.be/eiC58R16hb8)
- [Coroutine on Wikipedia](https://wikipedia.org/wiki/Coroutine)
- ["The 3 Ways JS Frameworks Render the DOM" by Ryan Carniato](https://youtu.be/0C-y59betmY)
- ["React Fiber Architecture" by Andrew Clark](https://github.com/acdlite/react-fiber-architecture )

## TODO

- `[COOL]` Flush onto something that's not the browser's DOM
- `[PEDANTIC]` Use more `switch`es
