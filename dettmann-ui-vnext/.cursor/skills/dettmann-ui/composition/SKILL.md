# Dettmann UI — Composition Pattern

Treat every complex component as a composition of independently useful parts.

## Structure

Prefer:

`Root -> Header -> Toolbar -> Body -> Footer`

or:

`Root -> Trigger + Content + Item`

Do not create a single component with dozens of boolean props when slots can express structure.

## Logic/UI separation

State, interaction and rendering should be separate at the structural level:

- state hooks own controllable state and events;
- primitives own semantics and layout;
- components own visual contracts;
- templates compose components into product patterns.

When behavior can be unit tested without rendering, isolate it.

## Interoperability

Components must accept `className`, preserve DOM props where safe, expose controlled/uncontrolled state when useful, and communicate through clear events rather than reaching into child DOM.

Prefer existing primitives (`Stack`, `Inline`, `Surface`, `Portal`, `Icon`) over bespoke markup.
