import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { Button } from "../src/components/common/Button.jsx";
import { Badge } from "../src/components/common/Badge.jsx";
import { Card } from "../src/components/common/Card.jsx";
import { Modal } from "../src/components/common/Modal.jsx";
import { LegalDisclaimer } from "../src/components/common/LegalDisclaimer.jsx";
import { TransactionReviewModal } from "../src/components/transaction/TransactionReviewModal.jsx";

describe("KNOVARA Common UI Components", () => {
  describe("LegalDisclaimer", () => {
    it("renders the mandatory cryptographic registry disclaimer text", () => {
      render(<LegalDisclaimer />);
      expect(
        screen.getByText(/A KNOVARA Discovery Rights Passport is a cryptographic registry record/i)
      ).toBeInTheDocument();
      expect(
        screen.getByRole("note", { name: /Legal & Cryptographic Notice/i })
      ).toHaveTextContent(/government-granted patent/i);
    });
  });

  describe("Button", () => {
    it("renders with correct variant class and handles click", () => {
      const handleClick = vi.fn();
      render(<Button variant="primary" onClick={handleClick}>Click Me</Button>);
      const btn = screen.getByText("Click Me");
      expect(btn).toHaveClass("knovara-btn-primary");
      fireEvent.click(btn);
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it("displays loading spinner and disables button when isLoading is true", () => {
      render(<Button isLoading>Submit</Button>);
      const btn = screen.getByRole("button");
      expect(btn).toBeDisabled();
      expect(screen.getByText("Processing...")).toBeInTheDocument();
    });
  });

  describe("Badge", () => {
    it("renders variant badge classes correctly", () => {
      const { rerender } = render(<Badge variant="blue">NEP-171</Badge>);
      expect(screen.getByText("NEP-171")).toHaveClass("knovara-badge-blue");

      rerender(<Badge variant="success">ACTIVE</Badge>);
      expect(screen.getByText("ACTIVE")).toHaveClass("knovara-badge-success");
    });
  });

  describe("Card", () => {
    it("renders title, subtitle, and content with editorial styling", () => {
      render(
        <Card title="Registry Passport" subtitle="Token #101" action={<button>Action</button>}>
          <div>Card Content</div>
        </Card>
      );
      expect(screen.getByText("Registry Passport")).toBeInTheDocument();
      expect(screen.getByText("Token #101")).toBeInTheDocument();
      expect(screen.getByText("Card Content")).toBeInTheDocument();
      expect(screen.getByText("Action")).toBeInTheDocument();
    });
  });

  describe("Modal", () => {
    it("renders when isOpen is true and calls onClose when close button clicked", () => {
      const handleClose = vi.fn();
      render(
        <Modal isOpen={true} onClose={handleClose} title="Test Modal">
          <p>Modal Body</p>
        </Modal>
      );
      expect(screen.getByText("Test Modal")).toBeInTheDocument();
      expect(screen.getByText("Modal Body")).toBeInTheDocument();

      const closeBtn = screen.getByLabelText("Close modal");
      fireEvent.click(closeBtn);
      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it("does not render when isOpen is false", () => {
      render(
        <Modal isOpen={false} title="Hidden Modal">
          <p>Hidden</p>
        </Modal>
      );
      expect(screen.queryByText("Hidden Modal")).not.toBeInTheDocument();
    });
  });

  describe("TransactionReviewModal", () => {
    const mockIntent = {
      networkId: "testnet",
      contractId: "koket-knovara-dev.testnet",
      methodName: "register_discovery_and_mint",
      args: { discovery_id: "disc-101", token_id: "tok-101" },
      attachedDeposit: "0",
      gas: "50000000000000",
    };

    it("displays method, deposit, gas, contract, and requires confirmation", () => {
      render(
        <TransactionReviewModal
          isOpen={true}
          onClose={vi.fn()}
          intent={mockIntent}
          explanation="Mints soulbound NFT passport on Testnet"
        />
      );

      expect(screen.getByText("koket-knovara-dev.testnet")).toBeInTheDocument();
      expect(screen.getByText("register_discovery_and_mint")).toBeInTheDocument();
      expect(screen.getByText("0 NEAR")).toBeInTheDocument();
      expect(screen.getByText("50 Tgas")).toBeInTheDocument();
      expect(screen.getByText(/Mints soulbound NFT passport on Testnet/i)).toBeInTheDocument();

      // Checkbox confirmation
      const checkbox = screen.getByRole("checkbox");
      expect(checkbox).not.toBeChecked();
      fireEvent.click(checkbox);
      expect(checkbox).toBeChecked();
    });
  });
});
