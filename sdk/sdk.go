// Package sdk is the public contract of a game adapter (D134, phase C3 of
// docs-ia/09-proposta-multi-jogo-e-extensoes.md): the optional interfaces
// an adapter implements, one per capability (D112), and, in its
// subpackages, the vocabulary they use (game, mod, plugin, installer,
// diagnostic, event, health, ordering, relpath).
//
// It lives outside internal/ so a module of another repository can import
// it. The built-in adapters are its first clients and import nothing else
// from this module (internal/architecture_test.go). The names are aliases of
// the core's types: the SDK adds no behaviour and has no copy to keep in
// sync. A name enters the SDK when an adapter needs it.
package sdk

// APIVersion is the version of the adapter contract. The major number
// changes when a name leaves the SDK or a type it names changes in a way an
// adapter notices (a method of an interface, a field it fills); the minor
// when a name is added.
const APIVersion = "1.1"
