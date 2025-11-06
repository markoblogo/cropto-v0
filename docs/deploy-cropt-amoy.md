# CROPT Token Deployment on Polygon Amoy

Из-за конфликтов зависимостей Hardhat (версия 3.x несовместима с hardhat-toolbox 6.x), мы используем Remix IDE для компиляции и развертывания контракта.

## Вариант 1: Развертывание через Remix IDE (РЕКОМЕНДУЕТСЯ)

### Шаг 1: Подготовка кошелька

1. Убедитесь, что у вас есть тестовые MATIC на Polygon Amoy
   - Адрес кошелька: `0x...` (из DEPLOYER_PRIVATE_KEY)
   - Получите тестовые токены:
     - https://faucet.polygon.technology/
     - https://www.alchemy.com/faucets/polygon-amoy

2. Импортируйте приватный ключ в MetaMask (ТОЛЬКО ДЛЯ ТЕСТОВОЙ СЕТИ!)

### Шаг 2: Компиляция в Remix

1. Откройте Remix IDE: https://remix.ethereum.org

2. Создайте новый файл `Cropt.sol` и вставьте код:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract Cropt is ERC20, ERC20Burnable, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    constructor(address defaultAdmin, address minter) ERC20("Cropto Token", "CROPT") {
        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
        _grantRole(MINTER_ROLE, minter);
    }

    function mint(address to, uint256 amount) public onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }

    function decimals() public pure override returns (uint8) {
        return 18;
    }
}
```

3. В левой панели выберите "Solidity Compiler" (иконка)
4. Настройки компиляции:
   - Compiler: `0.8.20`
   - EVM Version: `paris` или `default`
   - Enable optimization: ✅ (200 runs)
5. Нажмите "Compile Cropt.sol"

### Шаг 3: Развертывание

1. В левой панели выберите "Deploy & Run Transactions"

2. Настройки:
   - Environment: **Injected Provider - MetaMask**
   - Account: Выберите ваш кошелек (должен быть с тестовыми MATIC)
   - Gas Limit: `3000000`

3. Убедитесь, что MetaMask подключен к Polygon Amoy:
   - Network Name: `Polygon Amoy Testnet`
   - RPC URL: `https://polygon-amoy.g.alchemy.com/v2/5dHU6PKEJFVq2RRWHdVux`
   - Chain ID: `80002`
   - Currency: `MATIC`
   - Block Explorer: `https://amoy.polygonscan.com`

4. В Deploy секции:
   - Contract: `Cropt - contracts/Cropt.sol`
   - Constructor parameters:
     ```
     DEFAULTADMIN: 0x... (ваш адрес кошелька)
     MINTER: 0x... (ваш адрес кошелька)
     ```
   - Нажмите "Deploy"

5. Подтвердите транзакцию в MetaMask

6. Дождитесь подтверждения (обычно 5-10 секунд)

7. **СКОПИРУЙТЕ АДРЕС КОНТРАКТА** из Deployed Contracts

### Шаг 4: Сохранение адреса контракта

Добавьте адрес контракта в Replit Secrets:

```
CROPT_CONTRACT_ADDRESS=0x... (адрес из шага 3)
```

### Шаг 5: Проверка

Проверьте контракт на Polygonscan Amoy:
```
https://amoy.polygonscan.com/address/0x...
```

## Вариант 2: Исправление зависимостей Hardhat (ДЛЯ РАЗРАБОТЧИКОВ)

Если вы хотите использовать Hardhat локально, нужно исправить конфликты версий:

```bash
# Удалить hardhat-toolbox (конфликтует с Hardhat 3.x)
npm uninstall @nomicfoundation/hardhat-toolbox

# Установить совместимые пакеты для Hardhat 3.x
npm install --save-dev hardhat@^3.0.0 @nomicfoundation/hardhat-ethers@^3.0.0 ethers@^6.0.0

# Затем компиляция
npx hardhat compile

# И развертывание
npx hardhat run scripts/deploy-amoy.ts --network amoy
```

## Вариант 3: Использование Foundry (АЛЬТЕРНАТИВА)

Foundry - это более быстрая альтернатива Hardhat без конфликтов зависимостей:

```bash
# Установка Foundry
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Компиляция
forge build

# Развертывание
forge create contracts/Cropt.sol:Cropt \
  --rpc-url $POLYGON_AMOY_RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --constructor-args <YOUR_ADDRESS> <YOUR_ADDRESS>
```

## После развертывания

1. Сохраните адрес контракта в `CROPT_CONTRACT_ADDRESS`
2. Перезапустите приложение
3. Проверьте работу через:
   ```bash
   curl http://localhost:5000/api/onchain/balance/<YOUR_WALLET_ADDRESS>
   ```

## Troubleshooting

### MetaMask не подключается к Remix
- Убедитесь, что MetaMask разблокирован
- Проверьте, что выбрана сеть Polygon Amoy
- Обновите страницу Remix

### Ошибка "insufficient funds"
- Получите тестовые MATIC из faucet
- Подождите несколько минут после получения

### Транзакция застряла
- Увеличьте gas price в MetaMask
- Или отмените и попробуйте снова

### Контракт не отображается на Polygonscan
- Подождите 1-2 минуты
- Проверьте правильность адреса
- Убедитесь, что транзакция подтверждена
