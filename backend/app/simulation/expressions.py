"""Безопасный вычислитель условий на потоках (этап 3).

Условия BPMN — это данные, а не код: исполнять их через `eval` нельзя.
Поддерживается маленькое подмножество выражений: числа, строки, `true`/`false`,
переменные, сравнения (`==`, `!=`, `<`, `<=`, `>`, `>=`), логика
(`&&`, `||`, `!`), скобки и арифметика (`+`, `-`, `*`, `/`). Функций, доступа к
атрибутам и индексов нет — такое условие даёт понятную ошибку.
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import dataclass

type Value = bool | int | float | str

_TOKEN_RE = re.compile(
    r"""
    \s*(?:
        (?P<number>\d+(?:\.\d+)?)
      | (?P<string>'[^']*'|"[^"]*")
      | (?P<op><=|>=|==|!=|&&|\|\||[()!<>+\-*/])
      | (?P<name>[A-Za-z_][A-Za-z0-9_]*)
    )
    """,
    re.VERBOSE,
)

_KEYWORDS: dict[str, Value] = {"true": True, "false": False}


class ExpressionError(ValueError):
    """Условие нельзя разобрать или вычислить."""


class MissingVariableError(ExpressionError):
    """В условии есть переменная, которой нет в наборе: ветку выбирает пользователь."""

    def __init__(self, name: str) -> None:
        super().__init__(f"переменная «{name}» не задана")
        self.name = name


@dataclass(frozen=True, slots=True)
class _Token:
    kind: str
    value: str


def _tokenize(expression: str) -> list[_Token]:
    tokens: list[_Token] = []
    position = 0
    while position < len(expression):
        match = _TOKEN_RE.match(expression, position)
        if not match:
            raise ExpressionError(f"непонятный фрагмент условия в позиции {position + 1}")
        position = match.end()
        kind = match.lastgroup
        if kind is None:
            continue
        tokens.append(_Token(kind, match.group(kind)))
    return tokens


class _Parser:
    def __init__(self, expression: str, variables: Mapping[str, Value]) -> None:
        self._tokens = _tokenize(expression)
        self._index = 0
        self._variables = variables

    def parse(self) -> Value:
        if not self._tokens:
            raise ExpressionError("пустое условие")
        value = self._or()
        remaining = self._peek()
        if remaining is not None:
            raise ExpressionError(f"лишний фрагмент «{remaining.value}»")
        return value

    def _peek(self) -> _Token | None:
        return self._tokens[self._index] if self._index < len(self._tokens) else None

    def _peek_value(self) -> str | None:
        token = self._peek()
        return token.value if token is not None else None

    def _take(self, value: str | None = None) -> _Token:
        token = self._peek()
        if token is None:
            raise ExpressionError("условие оборвалось")
        if value is not None and token.value != value:
            raise ExpressionError(f"ожидалось «{value}», получено «{token.value}»")
        self._index += 1
        return token

    def _or(self) -> Value:
        value = self._and()
        while self._peek_value() == "||":
            self._take()
            right = self._and()
            value = bool(value) or bool(right)
        return value

    def _and(self) -> Value:
        value = self._not()
        while self._peek_value() == "&&":
            self._take()
            right = self._not()
            value = bool(value) and bool(right)
        return value

    def _not(self) -> Value:
        if self._peek_value() == "!":
            self._take()
            return not bool(self._not())
        return self._comparison()

    def _comparison(self) -> Value:
        left = self._additive()
        operator = self._peek_value()
        if operator not in {"==", "!=", "<", "<=", ">", ">="}:
            return left
        self._take()
        right = self._additive()
        try:
            match operator:
                case "==":
                    return left == right
                case "!=":
                    return left != right
                case "<":
                    return _ordered(left, right) < 0
                case "<=":
                    return _ordered(left, right) <= 0
                case ">":
                    return _ordered(left, right) > 0
                case ">=":
                    return _ordered(left, right) >= 0
        except TypeError as exc:
            raise ExpressionError(f"нельзя сравнить {left!r} и {right!r}") from exc
        raise ExpressionError(f"неизвестный оператор «{operator}»")

    def _additive(self) -> Value:
        value = self._multiplicative()
        while self._peek_value() in {"+", "-"}:
            operator = self._take().value
            right = self._multiplicative()
            value = _arithmetic(operator, value, right)
        return value

    def _multiplicative(self) -> Value:
        value = self._unary()
        while self._peek_value() in {"*", "/"}:
            operator = self._take().value
            right = self._unary()
            value = _arithmetic(operator, value, right)
        return value

    def _unary(self) -> Value:
        if self._peek_value() == "-":
            self._take()
            return -_number(self._unary())
        return self._primary()

    def _primary(self) -> Value:
        token = self._peek()
        if token is None:
            raise ExpressionError("условие оборвалось")
        if token.value == "(":
            self._take()
            value = self._or()
            self._take(")")
            return value
        if token.kind == "number":
            self._take()
            number = float(token.value)
            return int(number) if number.is_integer() else number
        if token.kind == "string":
            self._take()
            return token.value[1:-1]
        if token.kind == "name":
            self._take()
            if token.value in _KEYWORDS:
                return _KEYWORDS[token.value]
            if token.value not in self._variables:
                raise MissingVariableError(token.value)
            return self._variables[token.value]
        raise ExpressionError(f"неожиданный фрагмент «{token.value}»")


def _ordered(left: Value, right: Value) -> int:
    if not isinstance(left, (int, float)) or isinstance(left, bool):
        raise TypeError(left)
    if not isinstance(right, (int, float)) or isinstance(right, bool):
        raise TypeError(right)
    return (left > right) - (left < right)


def _number(value: Value) -> int | float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ExpressionError("арифметика допустима только для чисел")
    return value


def _arithmetic(operator: str, left: Value, right: Value) -> Value:
    lhs = _number(left)
    rhs = _number(right)
    if operator == "+":
        return lhs + rhs
    if operator == "-":
        return lhs - rhs
    if operator == "*":
        return lhs * rhs
    if rhs == 0:
        raise ExpressionError("деление на ноль")
    return lhs / rhs


def evaluate_value(expression: str, variables: Mapping[str, Value]) -> Value:
    """Вычисляет выражение и возвращает значение (для присваиваний в скриптах)."""
    return _Parser(expression, variables).parse()


def evaluate_condition(expression: str, variables: Mapping[str, Value]) -> bool:
    """Возвращает истинность условия; ошибки — `ExpressionError`."""
    return bool(evaluate_value(expression, variables))


__all__ = [
    "ExpressionError",
    "MissingVariableError",
    "Value",
    "evaluate_condition",
    "evaluate_value",
]
