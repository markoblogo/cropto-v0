# Testing Documentation

[Final E2E verification-record report](#final-e2e-verification-record--отчет)

## Overview

This document contains testing reports and validation results for the Cropto platform.

---

## Final E2E verification record — отчет

Ниже — итоговый автоматический отчёт по проверке создания document-bound ERC-721 verification record в Polygon Amoy:

```json
{
  "optionId": "919d1b5b-eb37-43c3-bb6d-abc48711e616",
  "txHash": "0xe239085b0e027d7e9a685a369fb7db8bb70f33f2b2f87cb8da69dcbd293f7f0f",
  "blockNumber": 28914798,
  "nft_token_id": 1,
  "nft_status": "MINTED",
  "polygonscan_url": "https://amoy.polygonscan.com/tx/0xe239085b0e027d7e9a685a369fb7db8bb70f33f2b2f87cb8da69dcbd293f7f0f",
  "nft_contract": "0xCE49ba494170495041e5f56a722762f74C968c3F",
  "nft_explorer_url": "https://amoy.polygonscan.com/token/0xCE49ba494170495041e5f56a722762f74C968c3F?a=1",
  "deployer": "0xf6CA524fa30BC1c55e09bF9eDD7B527c2eF6AcB6",
  "deployer_balance": "50.21 POL",
  "gas_used": "~0.0036 POL",
  "errors": null,
  "status": "SUCCESS"
}
```

**Кратко:** verification record успешно создан в Polygon Amoy (tokenId #1). Полный транзакционный лог доступен по ссылке выше. Этот тест подтверждает document-record mechanics, а не запуск speculative NFT marketplace.
