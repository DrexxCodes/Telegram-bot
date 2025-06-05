import React, { useState } from "react";
import styled, { ThemeProvider, keyframes } from "styled-components";
import { Eye, EyeOff } from "lucide-react";
import logo from "/public/logo.png";

const lightTheme = {
  background: "#f5f5f5",
  cardBackground: "#ffffff",
  text: "#333",
  inputBorder: "#ccc",
  buttonBackground: "#6b38fb",
  buttonHover: "#512dcf"
};

const darkTheme = {
  background: "#1c1c1c",
  cardBackground: "#2a2a2a",
  text: "#f1f1f1",
  inputBorder: "#444",
  buttonBackground: "#8c5bff",
  buttonHover: "#a378ff"
};

const LoginContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
  background-color: ${({ theme }) => theme.background};
  transition: background-color 0.3s ease;
`;

const FormCard = styled.div`
  background: ${({ theme }) => theme.cardBackground};
  padding: 2rem;
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  width: 100%;
  max-width: 400px;
  transition: background 0.3s ease;
`;

const Logo = styled.img`
  width: 50px;
  height: 50px;
  display: block;
  margin: 0 auto 1rem;
`;

const Title = styled.h2`
  text-align: center;
  margin-bottom: 1.5rem;
  color: ${({ theme }) => theme.text};
`;

const InputGroup = styled.div`
  margin-bottom: 1rem;
  position: relative;
`;

const Input = styled.input`
  width: 100%;
  padding: 0.75rem 1rem;
  padding-right: 3rem;
  border: 1px solid ${({ theme }) => theme.inputBorder};
  border-radius: 8px;
  font-size: 1rem;
  background-color: transparent;
  color: ${({ theme }) => theme.text};
`;

const ToggleButton = styled.button`
  position: absolute;
  right: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  color: ${({ theme }) => theme.text};
`;

const hoverAnimation = keyframes`
  0% { transform: scale(1); }
  50% { transform: scale(1.05); }
  100% { transform: scale(1); }
`;

const LoginButton = styled.button`
  width: 100%;
  padding: 0.75rem;
  background-color: ${({ theme }) => theme.buttonBackground};
  color: white;
  font-weight: bold;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  cursor: pointer;
  transition: background-color 0.3s ease;

  &:hover {
    animation: ${hoverAnimation} 0.4s ease-in-out;
    background-color: ${({ theme }) => theme.buttonHover};
  }
`;

const ToggleThemeButton = styled.button`
  margin-top: 1rem;
  width: 100%;
  padding: 0.5rem;
  background: transparent;
  color: ${({ theme }) => theme.text};
  border: 1px solid ${({ theme }) => theme.inputBorder};
  border-radius: 8px;
  cursor: pointer;
`;

const Login = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  const theme = darkMode ? darkTheme : lightTheme;

  return (
    <ThemeProvider theme={theme}>
      <LoginContainer>
        <FormCard>
          <Logo src={logo} alt="Spotix Logo" />
          <Title>Login to Spotix Bot</Title>
          <form>
            <InputGroup>
              <Input type="email" placeholder="Email" required />
            </InputGroup>
            <InputGroup>
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                required
              />
              <ToggleButton
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </ToggleButton>
            </InputGroup>
            <LoginButton type="submit">Login</LoginButton>
          </form>
          <ToggleThemeButton onClick={() => setDarkMode((prev) => !prev)}>
            Toggle {darkMode ? "Light" : "Dark"} Mode
          </ToggleThemeButton>
        </FormCard>
      </LoginContainer>
    </ThemeProvider>
  );
};

export default Login;
