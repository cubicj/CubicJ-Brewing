import { Plugin } from "obsidian";

export default class CubicJBrewingPlugin extends Plugin {
  async onload() {
    console.log("CubicJ Brewing loaded");
  }

  onunload() {
    console.log("CubicJ Brewing unloaded");
  }
}
