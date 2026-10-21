//go:build bindings

package main

// generatingBindings: this binary only generates the frontend bindings
// (wails generate module, wails dev, wails build). It must bind the app even
// when a window of the app is open, so the single instance check is skipped.
const generatingBindings = true
