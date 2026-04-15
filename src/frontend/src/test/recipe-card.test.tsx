// RecipeCard unit tests — swap button label and disabled state (UAT #69 Issue 1).

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { RecipeCard } from "@/components/recipe-card";

const baseProps = {
  index: 0,
  name: "Test Dish",
  flavorProfile: "Savory",
  cookingMethod: "Stir-fry",
  time: "20 min",
  ingredients: [],
  onSwap: vi.fn(),
  onInfoClick: vi.fn(),
};

describe("RecipeCard — swap button label", () => {
  it("renders 'Try another' when swapDisabled is false", () => {
    render(<RecipeCard {...baseProps} swapDisabled={false} />);
    expect(screen.getByRole("button", { name: /try another/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /no alternative/i })).toBeNull();
  });

  it("renders 'No alternative' when swapDisabled is true", () => {
    render(<RecipeCard {...baseProps} swapDisabled={true} />);
    expect(screen.getByRole("button", { name: /no alternative/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /try another/i })).toBeNull();
  });

  it("swap button is enabled when swapDisabled is false", () => {
    render(<RecipeCard {...baseProps} swapDisabled={false} />);
    expect(screen.getByRole("button", { name: /try another/i })).not.toBeDisabled();
  });

  it("swap button is disabled when swapDisabled is true", () => {
    render(<RecipeCard {...baseProps} swapDisabled={true} />);
    expect(screen.getByRole("button", { name: /no alternative/i })).toBeDisabled();
  });

  it("defaults to 'Try another' (enabled) when swapDisabled is not passed", () => {
    render(<RecipeCard {...baseProps} />);
    expect(screen.getByRole("button", { name: /try another/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try another/i })).not.toBeDisabled();
  });
});
